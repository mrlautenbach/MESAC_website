import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { EventEditForm } from "@/components/EventEditForm";
import { PhotoUploader } from "@/components/PhotoUploader";
import { PhotoCaptionEditor } from "@/components/PhotoCaptionEditor";
import { DocumentUploader } from "@/components/DocumentUploader";
import { DocumentList } from "@/components/DocumentList";
import { EventHistory } from "@/components/EventHistory";

export default async function EditEventPage({ params }: { params: Promise<{ event: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { event: eventId } = await params;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      season: { include: { tournament: true } },
      division: true,
      participants: { include: { school: true } },
      results: true,
      individualResults: true,
      photos: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!event) notFound();

  const participantSchoolIds = event.participants.map((p) => p.schoolId);
  const isAdmin = user.role === "ADMIN";
  const isScopedEditor = user.role === "EDITOR" && !!user.schoolId && participantSchoolIds.includes(user.schoolId);
  if (!isAdmin && !isScopedEditor) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-danger">You don&apos;t have access to edit this event.</p>
      </div>
    );
  }

  const participants = event.participants.map((p) => {
    const result = event.results.find((r) => r.schoolId === p.schoolId);
    return {
      schoolId: p.schoolId,
      schoolName: p.school.name,
      score: result?.score ?? null,
      outcome: result?.outcome ?? null,
    };
  });

  const individualResultsBySchool: Record<string, { athleteName: string; score: number }[]> = {};
  for (const entry of event.individualResults) {
    (individualResultsBySchool[entry.schoolId] ??= []).push({ athleteName: entry.athleteName, score: entry.score });
  }

  const resultIds = event.results.map((r) => r.id);
  const photoIds = event.photos.map((p) => p.id);
  const documentIds = event.documents.map((d) => d.id);
  const auditEntries = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Event", entityId: event.id },
        { entityType: "Result", entityId: { in: resultIds } },
        { entityType: "IndividualResults", entityId: event.id },
        { entityType: "Photo", entityId: { in: photoIds } },
        { entityType: "Document", entityId: { in: documentIds } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <Link
          href={`/seasons/${event.season.slug}/events/${event.slug}`}
          className="text-sm font-semibold text-primary hover:underline"
        >
          &larr; View public event page
        </Link>
        <h1 className="mt-1 text-2xl font-bold">
          {event.participants.map((p) => p.school.name).join(" vs ")}
        </h1>
        <p className="text-muted">
          {event.season.tournament.name}
          {event.division ? ` — ${event.division.name}` : ""} ({event.season.name})
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Event details &amp; result</h2>
        <EventEditForm
          eventId={event.id}
          isAdmin={isAdmin}
          viewerSchoolId={user.schoolId}
          dateValue={format(event.date, "yyyy-MM-dd'T'HH:mm")}
          location={event.location ?? ""}
          status={event.status}
          recap={event.recap ?? ""}
          scoringType={event.season.tournament.scoringType}
          participants={participants}
          individualResultsBySchool={individualResultsBySchool}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Results document</h2>
        <p className="mb-3 text-sm text-muted">
          Attach a PDF of full results — useful for meets and festivals that don&apos;t fit a simple win/loss score.
        </p>
        <DocumentUploader eventId={event.id} />
        {event.documents.length > 0 && (
          <div className="mt-4">
            <DocumentList documents={event.documents} canDelete={isAdmin} />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">Add photos</h2>
        <PhotoUploader eventId={event.id} />
      </section>

      {event.photos.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Photos</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {event.photos.map((photo) => (
              <PhotoCaptionEditor key={photo.id} photo={photo} canDelete={isAdmin} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Edit history</h2>
        <EventHistory entries={auditEntries} isAdmin={isAdmin} />
      </section>
    </div>
  );
}

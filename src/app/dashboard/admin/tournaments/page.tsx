import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ActivityForm } from "@/components/ActivityForm";
import { EXPECTED_ROSTER } from "@/lib/expectedRoster";
import { SCORING_LABELS } from "@/lib/scoringLabels";

export default async function TournamentsAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.role === "ADMIN";

  const [seasons, schools] = await Promise.all([
    prisma.season.findMany({
      orderBy: { order: "asc" },
      include: {
        activities: {
          orderBy: { name: "asc" },
          include: {
            tournaments: {
              orderBy: [{ archived: "asc" }, { startDate: "desc" }],
              select: { id: true, name: true, isCurrent: true, archived: true, startDate: true, endDate: true },
            },
          },
        },
      },
    }),
    isAdmin ? prisma.school.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const activityCount = seasons.reduce((n, s) => n + s.activities.length, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Activities ({activityCount})</h1>
        <p className="mt-1 text-sm text-muted">
          Pick an activity to manage its current tournament, past tournaments and settings.
        </p>
      </div>

      {seasons.map((season) => {
        const existingNames = new Set(season.activities.map((a) => a.name.trim().toLowerCase()));
        const missing = EXPECTED_ROSTER.filter(
          (e) => e.seasonOrder === season.order && !existingNames.has(e.name.trim().toLowerCase())
        );
        return (
          <section key={season.id}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{season.name}</h2>
            {missing.length > 0 && (
              <p className="mb-3 text-sm text-muted">
                Not set up yet: {missing.map((e) => e.name).join(", ")}.
                {isAdmin && " Use “Create an activity” below."}
              </p>
            )}
            {season.activities.length === 0 ? (
              <p className="text-sm text-muted">No activities in this season yet.</p>
            ) : (
              <ul className="card divide-y divide-border">
                {season.activities.map((activity) => {
                  const current = activity.tournaments.find((t) => t.isCurrent) ?? activity.tournaments[0];
                  return (
                    <li key={activity.id}>
                      <Link
                        href={`/dashboard/admin/tournaments/${activity.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-foreground/[.04]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{activity.name}</span>
                          <span className="block text-xs text-muted">
                            {activity.sport} · {SCORING_LABELS[activity.scoringType]}
                          </span>
                        </span>
                        <span className="text-right text-sm">
                          {current ? (
                            <>
                              <span className="block font-medium">
                                {current.name}
                                {current.archived && <span className="ml-1.5 tag tag-neutral">Archived tag on</span>}
                              </span>
                              <span className="block text-xs text-muted">
                                {format(current.startDate, "MMM d")} – {format(current.endDate, "MMM d, yyyy")}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted">No tournament yet</span>
                          )}
                        </span>
                        <span aria-hidden="true" className="text-muted">
                          &rsaquo;
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {isAdmin && (
        <div className="border-t-2 border-divider pt-8">
          <h2 className="mb-1 text-xl font-bold">Create an activity</h2>
          <p className="mb-6 text-sm text-muted">
            For a new sport or division not already listed above. Most years won&apos;t need this.
          </p>
          <ActivityForm seasons={seasons.map((s) => ({ id: s.id, name: s.name }))} schools={schools} />
        </div>
      )}
    </div>
  );
}

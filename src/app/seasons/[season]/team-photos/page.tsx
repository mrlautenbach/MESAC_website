import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type School = { id: string; name: string };
type Slot = { school: School; photoUrl: string | null };

export default async function TeamPhotosPage({ params }: { params: Promise<{ season: string }> }) {
  const { season: slug } = await params;
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: { activity: { include: { divisions: true } } },
  });
  if (!tournament) notFound();

  const [schools, teamPhotos] = await Promise.all([
    prisma.school.findMany({ orderBy: { name: "asc" } }),
    prisma.teamPhoto.findMany({ where: { tournamentId: tournament.id } }),
  ]);

  const slotByKey = new Map(teamPhotos.map((p) => [`${p.schoolId}:${p.divisionId ?? "none"}`, p]));
  const isEnabled = (schoolId: string, divisionId: string | null) =>
    slotByKey.get(`${schoolId}:${divisionId ?? "none"}`)?.enabled ?? true;
  const photoFor = (schoolId: string, divisionId: string | null) =>
    slotByKey.get(`${schoolId}:${divisionId ?? "none"}`)?.photoUrl ?? null;

  const realDivisions = tournament.activity.divisions;
  const girlsDivision = realDivisions.find((d) => d.name.toLowerCase() === "girls") ?? null;
  const boysDivision = realDivisions.find((d) => d.name.toLowerCase() === "boys") ?? null;
  const isGendered = realDivisions.length > 0;
  const showGirls = tournament.showGirlsTeamPhotos;
  const showBoys = tournament.showBoysTeamPhotos;

  let sections: { label: string | null; slots: Slot[]; nameOnly: boolean }[];

  if (!isGendered) {
    const slots = schools.filter((s) => isEnabled(s.id, null)).map((school) => ({ school, photoUrl: photoFor(school.id, null) }));
    sections = [{ label: null, slots, nameOnly: false }];
  } else if (showGirls && showBoys) {
    sections = realDivisions.map((division) => ({
      label: division.name,
      nameOnly: false,
      slots: schools
        .filter((s) => isEnabled(s.id, division.id))
        .map((school) => ({ school, photoUrl: photoFor(school.id, division.id) })),
    }));
  } else if (showGirls || showBoys) {
    const activeDivision = showGirls ? girlsDivision : boysDivision;
    const slots = schools
      .filter((s) => isEnabled(s.id, activeDivision?.id ?? null))
      .map((school) => ({ school, photoUrl: photoFor(school.id, activeDivision?.id ?? null) }));
    sections = [{ label: null, slots, nameOnly: false }];
  } else {
    // Neither gender active this year - just list schools fielding either team, by name only.
    const slots = schools
      .filter((s) => isEnabled(s.id, girlsDivision?.id ?? null) || isEnabled(s.id, boysDivision?.id ?? null))
      .map((school) => ({ school, photoUrl: null }));
    sections = [{ label: null, slots, nameOnly: true }];
  }

  const hasAnySlots = sections.some((s) => s.slots.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link href={`/seasons/${tournament.slug}`} className="text-sm font-semibold text-primary-dark hover:underline">
        &larr; {tournament.activity.name}
      </Link>
      <h6 className="mt-4 text-primary-dark">{tournament.activity.sport}</h6>
      <h1 className="mt-2 mb-8 text-4xl sm:text-5xl">{tournament.activity.name} team photos</h1>

      {!hasAnySlots ? (
        <p className="text-muted">No team photos yet.</p>
      ) : (
        <div className="space-y-10">
          {sections.map(
            ({ label, slots, nameOnly }) =>
              slots.length > 0 && (
                <section key={label ?? "all"}>
                  {label && <h4 className="mb-4">{label}</h4>}
                  {nameOnly ? (
                    <ul className="flex flex-wrap gap-3">
                      {slots.map(({ school }) => (
                        <li key={school.id} className="border border-divider px-4 py-2 text-sm font-semibold">
                          {school.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      {slots.map(({ school, photoUrl }) => (
                        <figure key={school.id} className="border border-divider">
                          <div className="relative flex h-[160px] items-center justify-center bg-foreground/5">
                            {photoUrl ? (
                              <Image src={photoUrl} alt={school.name} fill className="object-cover" />
                            ) : (
                              <span className="px-4 text-center text-[11px] tracking-[0.1em] text-muted">
                                PHOTO COMING SOON
                              </span>
                            )}
                          </div>
                          <figcaption className="border-t border-divider p-2 text-center text-sm font-semibold">
                            {school.name}
                          </figcaption>
                        </figure>
                      ))}
                    </div>
                  )}
                </section>
              )
          )}
        </div>
      )}
    </div>
  );
}

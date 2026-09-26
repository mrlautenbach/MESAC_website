import { prisma } from "@/lib/prisma";

// A tournament page's browser-tab title: "Girls JV Volleyball schedule",
// or just the activity's name for its main page (the layout adds "· MESAC").
export async function tournamentPageTitle(slug: string, page?: string, divisionSlug?: string): Promise<string> {
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    select: { name: true, activity: { select: { name: true } }, divisions: { select: { slug: true, name: true } } },
  });
  if (!tournament) return "Tournament";
  const division = divisionSlug ? tournament.divisions.find((d) => d.slug === divisionSlug) : undefined;
  const name = `${division ? `${division.name} ` : ""}${tournament.activity.name}`;
  return page ? `${name} ${page}` : `${name} · ${tournament.name}`;
}

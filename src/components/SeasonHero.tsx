import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";
import { SportIcon } from "@/components/icons/SportIcon";

export function SeasonHero({
  activityName,
  activitySport,
  activitySlug,
  tournamentName,
  divisionName,
  startDate,
  endDate,
  hostSchoolName,
  hostSchoolLogoUrl,
  archived,
  titleAs: Title = "h1",
}: {
  activityName: string;
  activitySport: string;
  activitySlug: string;
  tournamentName: string;
  divisionName?: string;
  startDate: Date;
  endDate: Date;
  hostSchoolName?: string | null;
  hostSchoolLogoUrl?: string | null;
  archived: boolean;
  // The page's h1 - except where the page has its own (a game's matchup).
  titleAs?: "h1" | "div";
}) {
  // The tournament's own dates decide the year shown here - never today's
  // date or which edition happens to be "current" - so an archived tag
  // always names the actual year it ran, even years after the fact.
  const startYear = format(startDate, "yyyy");
  const endYear = format(endDate, "yyyy");
  const archivedYearLabel = startYear === endYear ? startYear : `${startYear}–${endYear.slice(2)}`;

  return (
    <div className="relative overflow-hidden bg-ink py-7 text-on-ink sm:py-10">
      <div className="lattice-panel absolute inset-0 text-accent opacity-[.16]" />
      <div className="page-wrap relative">
        <Link href={`/tournaments/${activitySlug}`} className="text-sm font-semibold text-accent hover:underline">
          &larr; {activityName}
        </Link>
        <div className="mt-3 grid gap-8 sm:grid-cols-[1.4fr_1fr] sm:items-end">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-accent opacity-90">
              <SportIcon sport={activitySport} size={18} />
              {activitySport} · {tournamentName}
              {archived && ` · Archived (${archivedYearLabel})`}
            </p>
            <Title className="mt-3 text-4xl font-extrabold leading-[.95] tracking-tight sm:text-6xl">
              {divisionName ? `${divisionName} ${activityName}` : activityName}
            </Title>
          </div>
          <div className="grid border border-accent/40 text-sm">
            <div className={`px-4 py-3 ${hostSchoolName ? "border-b border-accent/40" : ""}`}>
              <div className="text-[11px] tracking-[0.12em] opacity-80">DATES</div>
              <div className="text-[17px] font-extrabold">
                {format(startDate, "d MMM")} – {format(endDate, "d MMM yyyy")}
              </div>
            </div>
            {hostSchoolName && (
              <div className="flex items-center gap-3 px-4 py-3">
                {hostSchoolLogoUrl && (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-accent/30 bg-white p-1">
                    <Image
                      src={hostSchoolLogoUrl}
                      alt={hostSchoolName}
                      width={44}
                      height={44}
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}
                <div>
                  <div className="text-[11px] tracking-[0.12em] opacity-80">HOST</div>
                  <div className="text-[17px] font-extrabold">{hostSchoolName}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

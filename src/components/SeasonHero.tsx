import Link from "next/link";
import Image from "next/image";
import { format } from "date-fns";

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
  isCurrent,
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
  isCurrent: boolean;
}) {
  return (
    <div className="relative overflow-hidden bg-foreground px-6 py-10 text-background sm:px-10">
      <div className="lattice-panel absolute inset-0 text-accent opacity-[.16]" />
      <div className="relative mx-auto max-w-5xl">
        <Link href={`/tournaments/${activitySlug}`} className="text-sm font-semibold text-accent hover:underline">
          &larr; {activityName}
        </Link>
        <div className="mt-3 grid gap-8 sm:grid-cols-[1.4fr_1fr] sm:items-end">
          <div>
            <h6 className="text-accent opacity-90">
              {activitySport} · {tournamentName}
              {!isCurrent && " · Archived"}
            </h6>
            <div className="mt-3 text-4xl font-extrabold leading-[.95] tracking-tight sm:text-6xl">
              {divisionName ? `${divisionName} ${activityName}` : activityName}
            </div>
          </div>
          <div className="grid border border-accent/40 text-sm">
            <div className={`px-4 py-3 ${hostSchoolName ? "border-b border-accent/40" : ""}`}>
              <div className="text-[10px] tracking-[0.12em] opacity-70">DATES</div>
              <div className="text-[17px] font-extrabold">
                {format(startDate, "d MMM")} – {format(endDate, "d MMM yyyy")}
              </div>
            </div>
            {hostSchoolName && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden border border-accent/30 bg-white/10">
                  {hostSchoolLogoUrl ? (
                    <Image
                      src={hostSchoolLogoUrl}
                      alt={hostSchoolName}
                      width={44}
                      height={44}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs font-bold tracking-wide">{hostSchoolName.slice(0, 3).toUpperCase()}</span>
                  )}
                </div>
                <div>
                  <div className="text-[10px] tracking-[0.12em] opacity-70">HOST</div>
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

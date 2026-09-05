import Link from "next/link";
import { LiveIcon } from "@/components/icons/LiveIcon";

export function TournamentSubNav({
  tournamentSlug,
  divisionSlug,
  active,
}: {
  tournamentSlug: string;
  divisionSlug?: string | null;
  active?: "schedule" | "results" | "watch-live";
}) {
  const base = divisionSlug ? `/seasons/${tournamentSlug}/${divisionSlug}` : `/seasons/${tournamentSlug}`;
  return (
    <div className="mb-8 flex flex-wrap gap-3">
      <Link href={`${base}/schedule`} className={`btn ${active === "schedule" ? "btn-primary" : "btn-secondary"}`}>
        Schedule
      </Link>
      <Link href={`${base}/results`} className={`btn ${active === "results" ? "btn-primary" : "btn-secondary"}`}>
        Results
      </Link>
      <Link
        href={`/seasons/${tournamentSlug}/watch-live`}
        className={`btn inline-flex items-center gap-1 ${active === "watch-live" ? "btn-primary" : "btn-secondary"}`}
      >
        <LiveIcon />
        Watch live
      </Link>
      <Link href={`/seasons/${tournamentSlug}/team-photos`} className="btn btn-secondary">
        Team photos
      </Link>
    </div>
  );
}

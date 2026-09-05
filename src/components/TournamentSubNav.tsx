import Link from "next/link";

export function TournamentSubNav({
  tournamentSlug,
  divisionSlug,
  active,
  liveStreamUrl,
}: {
  tournamentSlug: string;
  divisionSlug?: string | null;
  active?: "schedule" | "results";
  liveStreamUrl?: string | null;
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
      {liveStreamUrl && (
        <a href={liveStreamUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
          Watch live &rarr;
        </a>
      )}
      <Link href={`/seasons/${tournamentSlug}/team-photos`} className="btn btn-secondary">
        Team photos
      </Link>
    </div>
  );
}

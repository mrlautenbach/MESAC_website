import { revalidatePath } from "next/cache";

// Every public path whose content is derived from one tournament's events.
//
// This lives in one place because the call sites had drifted three separate
// ways: saving a result refreshed the division pages but not /schedule or the
// home page's score ticker, editing a tournament refreshed its activity page
// but not the /tournaments index, and a records edit never refreshed
// /records/[year] at all. Anything that changes a tournament's events should
// call this rather than hand-listing paths again.
export function revalidateTournament(tournament: { slug: string; activitySlug: string }): void {
  // Sitewide surfaces that read events across every tournament.
  revalidatePath("/"); // latest-results ticker, score cells, upcoming cards
  revalidatePath("/schedule"); // per-activity upcoming preview
  revalidatePath("/tournaments"); // lists each activity's current tournament name

  revalidatePath(`/tournaments/${tournament.activitySlug}`);
  revalidatePath(`/seasons/${tournament.slug}`); // next fixture + latest result
  revalidatePath(`/seasons/${tournament.slug}/schedule`);
  revalidatePath(`/seasons/${tournament.slug}/results`);
  revalidatePath(`/seasons/${tournament.slug}/watch-live`);

  // Division pages are per-tournament too, but their slugs aren't always known
  // at the call site (an importer touches many divisions at once). The route
  // pattern covers every division of every tournament - broader than needed,
  // but a league this size regenerates them cheaply, and missing one is worse
  // than refreshing a few extra.
  revalidatePath("/seasons/[season]/[division]/schedule", "page");
  revalidatePath("/seasons/[season]/[division]/results", "page");
}

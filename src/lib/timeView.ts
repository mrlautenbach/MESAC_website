import { cookies } from "next/headers";
import { TIME_VIEW_COOKIE, isTimeView, makeClock, tournamentZone, type TimeView } from "@/lib/timeZones";

// The time zone this visitor has chosen to see times in (the switch on
// schedule pages), or each tournament's own time until they choose.
export async function getTimeView(): Promise<TimeView> {
  const value = (await cookies()).get(TIME_VIEW_COOKIE)?.value;
  return isTimeView(value) ? value : "HOST";
}

// The clock for one tournament's times, for this visitor.
export async function clockFor(tournament: Parameters<typeof tournamentZone>[0]) {
  return makeClock(tournamentZone(tournament), await getTimeView());
}

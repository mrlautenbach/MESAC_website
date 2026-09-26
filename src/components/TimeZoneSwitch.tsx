"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LEAGUE_ZONES, TIME_VIEW_COOKIE, ZONE_KEYS, type LeagueZone, type TimeView } from "@/lib/timeZones";

// Which time zone a page's times are shown in. The choice is remembered on
// this device (a cookie the server reads), and applies on every page.
// `hostZone` names the tournament's own zone; a page covering several
// tournaments leaves it out, so "host's time" means each one's own.
export function TimeZoneSwitch({ view, hostZone }: { view: TimeView; hostZone?: LeagueZone }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(value: string) {
    document.cookie = `${TIME_VIEW_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="font-semibold text-muted">Times in</span>
      <select
        value={view}
        onChange={(e) => choose(e.target.value)}
        disabled={pending}
        className="field-input min-h-10 w-auto py-1 text-sm font-semibold sm:min-h-0"
      >
        <option value="HOST">{hostZone ? `Host's time (${LEAGUE_ZONES[hostZone].label})` : "Each host's time"}</option>
        {ZONE_KEYS.map((zone) => (
          <option key={zone} value={zone}>
            {LEAGUE_ZONES[zone].label}
          </option>
        ))}
      </select>
    </label>
  );
}

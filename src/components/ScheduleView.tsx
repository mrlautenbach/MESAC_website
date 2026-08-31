"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Fixture = {
  id: string;
  time: string;
  location: string | null;
  names: string | null;
  home: string | null;
  away: string | null;
  score: string | null;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  streamUrl: string | null;
  tournamentName: string;
  divisionName: string | null;
  href: string;
};

type Day = { key: string; label: string; fixtures: Fixture[] };

const STATUS_TAG: Record<string, string> = {
  SCHEDULED: "tag-accent",
  COMPLETED: "tag-neutral",
  CANCELLED: "tag-outline",
};

export function ScheduleView({ days }: { days: Day[] }) {
  const router = useRouter();
  const [active, setActive] = useState(days[0]?.key);
  const day = days.find((d) => d.key === active) ?? days[0];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-0 border-b-2 border-divider pb-0">
        {days.map((d) => (
          <button
            key={d.key}
            onClick={() => setActive(d.key)}
            className="btn"
            style={{
              border: "1px solid var(--divider)",
              marginRight: -1,
              marginBottom: -2,
              background: d.key === day?.key ? "var(--primary)" : "transparent",
              color: d.key === day?.key ? "var(--background)" : "var(--foreground)",
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      <ul className="mt-2">
        {day?.fixtures.map((f) => (
          <li key={f.id}>
            <div
              role="link"
              tabIndex={0}
              onClick={() => router.push(f.href)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(f.href);
              }}
              className="grid cursor-pointer grid-cols-[64px_1fr_auto] items-center gap-4 border-b border-divider py-4 hover:bg-surface sm:grid-cols-[80px_1fr_120px_140px]"
            >
              <div>
                <div className="text-lg font-extrabold tabular-nums tracking-tight">{f.time}</div>
                {f.location && <div className="text-[11px] tracking-[0.08em] text-muted">{f.location}</div>}
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                {f.names ? (
                  <span className="font-extrabold">{f.names}</span>
                ) : (
                  <>
                    <span className="font-extrabold">{f.home}</span>
                    {f.score && <span className="text-2xl font-extrabold tabular-nums tracking-tight text-primary">{f.score}</span>}
                    <span className="font-extrabold">{f.away}</span>
                  </>
                )}
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                {f.streamUrl && f.status === "SCHEDULED" && (
                  <a
                    href={f.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tag tag-accent"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Watch live
                  </a>
                )}
                <span className={`tag ${STATUS_TAG[f.status]}`}>{f.status}</span>
              </div>
              <div className="text-right text-xs text-muted">
                {f.tournamentName}
                {f.divisionName ? ` — ${f.divisionName}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

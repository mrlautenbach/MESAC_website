"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SchoolColorDot } from "@/components/SchoolColorDot";

type Fixture = {
  id: string;
  time: string;
  location: string | null;
  names: string | null;
  home: string | null;
  away: string | null;
  homeColor?: string | null;
  homeSecondaryColor?: string | null;
  awayColor?: string | null;
  awaySecondaryColor?: string | null;
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

type Gender = "girls" | "boys" | null;

function genderOf(divisionName: string | null): Gender {
  if (!divisionName) return null;
  const normalized = divisionName.trim().toLowerCase();
  if (normalized === "girls") return "girls";
  if (normalized === "boys") return "boys";
  return null;
}

const GENDER_TAG: Record<"girls" | "boys", string> = {
  girls: "tag-girls",
  boys: "tag-boys",
};

const GENDER_BORDER: Record<"girls" | "boys", string> = {
  girls: "var(--girls)",
  boys: "var(--boys)",
};

type GenderFilter = "all" | "girls" | "boys";

export function ScheduleView({ days }: { days: Day[] }) {
  const router = useRouter();
  const [active, setActive] = useState(days[0]?.key);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("all");
  const day = days.find((d) => d.key === active) ?? days[0];

  const hasGenderedFixtures = days.some((d) => d.fixtures.some((f) => genderOf(f.divisionName) !== null));
  const fixtures = (day?.fixtures ?? []).filter(
    (f) => genderFilter === "all" || genderOf(f.divisionName) === genderFilter
  );

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        {hasGenderedFixtures && (
          <div className="flex gap-2">
            {(["all", "girls", "boys"] as const).map((g) => {
              const isActive = genderFilter === g;
              const color = g === "girls" ? "var(--girls)" : g === "boys" ? "var(--boys)" : "var(--primary)";
              return (
                <button
                  key={g}
                  onClick={() => setGenderFilter(g)}
                  className="tag"
                  style={{
                    border: `1px solid ${color}`,
                    background: isActive ? color : "transparent",
                    color: isActive ? "var(--background)" : color,
                  }}
                >
                  {g === "all" ? "All" : g === "girls" ? "Girls" : "Boys"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ul className="mt-2">
        {fixtures.map((f) => {
          const gender = genderOf(f.divisionName);
          return (
            <li key={f.id}>
              <div
                role="link"
                tabIndex={0}
                onClick={() => router.push(f.href)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") router.push(f.href);
                }}
                style={gender ? { borderLeft: `4px solid ${GENDER_BORDER[gender]}` } : undefined}
                className="grid cursor-pointer grid-cols-[64px_1fr_auto] items-center gap-4 border-b border-divider py-4 pl-3 hover:bg-surface sm:grid-cols-[80px_1fr_120px_140px]"
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
                      <span className="inline-flex items-center gap-1.5 font-extrabold">
                        <SchoolColorDot color={f.homeColor} secondaryColor={f.homeSecondaryColor} />
                        {f.home}
                      </span>
                      {f.score && <span className="text-2xl font-extrabold tabular-nums tracking-tight text-primary">{f.score}</span>}
                      <span className="inline-flex items-center gap-1.5 font-extrabold">
                        <SchoolColorDot color={f.awayColor} secondaryColor={f.awaySecondaryColor} />
                        {f.away}
                      </span>
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
                <div className="flex items-center justify-end gap-2 text-right text-xs text-muted">
                  <span>{f.tournamentName}</span>
                  {gender && <span className={`tag ${GENDER_TAG[gender]}`}>{f.divisionName}</span>}
                  {!gender && f.divisionName && <span>— {f.divisionName}</span>}
                </div>
              </div>
            </li>
          );
        })}
        {fixtures.length === 0 && <li className="py-6 text-sm text-muted">No fixtures match this filter.</li>}
      </ul>
    </div>
  );
}

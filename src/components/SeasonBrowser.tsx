"use client";

import { useState } from "react";
import Link from "next/link";
import { SEASON_DATE_RANGES } from "@/lib/seasonCalendar";

type SeasonCard = {
  id: string;
  name: string;
  order: number;
  activities: { id: string; name: string; href: string }[];
};

// A tab/slider switcher between the three Seasons - "more prominent" than a
// plain list, and lets a visitor flip through Season 1/2/3 without leaving
// the home page.
export function SeasonBrowser({ seasons }: { seasons: SeasonCard[] }) {
  const [index, setIndex] = useState(0);
  const season = seasons[index];

  if (!season) {
    return <p className="text-sm text-muted">Seasons haven&apos;t been configured yet.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-0">
          {seasons.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setIndex(i)}
              className="btn"
              style={{
                border: "1px solid var(--divider)",
                marginRight: -1,
                background: i === index ? "var(--primary)" : "transparent",
                color: i === index ? "var(--background)" : "var(--foreground)",
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            aria-label="Previous season"
            onClick={() => setIndex((i) => (i - 1 + seasons.length) % seasons.length)}
            className="btn btn-secondary px-2.5 py-1 text-xs"
          >
            &larr;
          </button>
          <button
            type="button"
            aria-label="Next season"
            onClick={() => setIndex((i) => (i + 1) % seasons.length)}
            className="btn btn-secondary px-2.5 py-1 text-xs"
          >
            &rarr;
          </button>
        </div>
      </div>

      <div className="mt-4 text-[13px] tracking-[0.08em] text-muted">{SEASON_DATE_RANGES[season.order] ?? ""}</div>
      <div className="text-4xl font-extrabold leading-[.95] tracking-tight">{season.name}</div>

      {season.activities.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No activities in this season yet.</p>
      ) : (
        <ul className="mt-4 flex flex-wrap gap-2">
          {season.activities.map((a) => (
            <li key={a.id}>
              <Link href={a.href} className="tag tag-neutral">
                {a.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

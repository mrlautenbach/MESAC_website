"use client";

import Link from "next/link";
import { useState } from "react";
import { format } from "date-fns";

type UpcomingCard = {
  slug: string;
  name: string;
  startDate: Date;
  endDate: Date;
  hostSchoolName: string | null;
};

// The home page's "Next up" card, upgraded to a manually-advanced gallery
// through every fetched upcoming tournament (not just the soonest one) -
// same arrow/dot pattern as PhotoSlider, restyled for this dark card.
export function NextUpGallery({ tournaments }: { tournaments: UpcomingCard[] }) {
  const [index, setIndex] = useState(0);

  if (tournaments.length === 0) {
    return <p className="relative text-sm opacity-90">No upcoming events scheduled.</p>;
  }

  const tournament = tournaments[index];

  return (
    <div className="relative">
      <div className="flex items-center justify-between gap-3">
        <h6 className="text-accent opacity-90">Next up</h6>
        {tournaments.length > 1 && (
          <div className="flex gap-1.5">
            <button
              type="button"
              aria-label="Previous upcoming tournament"
              onClick={() => setIndex((i) => (i - 1 + tournaments.length) % tournaments.length)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm hover:bg-white/20"
            >
              &lsaquo;
            </button>
            <button
              type="button"
              aria-label="Next upcoming tournament"
              onClick={() => setIndex((i) => (i + 1) % tournaments.length)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-sm hover:bg-white/20"
            >
              &rsaquo;
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">{tournament.name}</div>
      <p className="mt-3 text-[13px] opacity-90">
        {format(tournament.startDate, "MMM d")} – {format(tournament.endDate, "MMM d")}
        {tournament.hostSchoolName ? ` · Hosted by ${tournament.hostSchoolName}` : ""}
      </p>
      <Link
        href={`/seasons/${tournament.slug}`}
        className="btn btn-block mt-4 text-[13px]"
        style={{ background: "var(--accent)", color: "var(--primary-deep)" }}
      >
        Tournament details →
      </Link>
      {tournaments.length > 1 && (
        <div className="mt-3 flex gap-1.5">
          {tournaments.map((t, i) => (
            <button
              key={t.slug}
              type="button"
              aria-label={`Show upcoming tournament ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-accent" : "bg-white/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

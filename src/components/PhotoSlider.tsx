"use client";

import { useState } from "react";
import Image from "next/image";

type SliderPhoto = { id: string; url: string; altText: string | null };

// The home page hero photo, as a manually-advanced slider. Shows whichever
// photos the caller passed (already prioritized: admin-picked photos over
// the newest ones, chosen by the caller) - this component only handles
// stepping through them.
export function PhotoSlider({ photos }: { photos: SliderPhoto[] }) {
  const [index, setIndex] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center bg-foreground/10">
        <span className="px-4 text-center text-xs tracking-[0.12em] text-muted">PHOTOGRAPH · B&amp;W</span>
      </div>
    );
  }

  const photo = photos[index];

  return (
    <div className="relative h-full min-h-[480px]">
      <Image
        key={photo.id}
        src={photo.url}
        alt={photo.altText ?? ""}
        fill
        className="object-cover grayscale contrast-[1.08]"
      />
      {photos.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => setIndex((i) => (i + 1) % photos.length)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-lg text-white hover:bg-black/60"
          >
            &rsaquo;
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                aria-label={`Show photo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

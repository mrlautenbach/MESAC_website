"use client";

import { useEffect, useRef, useState } from "react";

type SchoolPoint = { code: string; name: string; city: string; teams: number; lat: number; lon: number };
type Cluster = {
  lon: number;
  lat: number;
  city: string;
  members: SchoolPoint[];
  x: number;
  y: number;
  code: string;
  place: string;
  teams: number;
  flip: boolean;
  dy: number;
};

// Ports the design handoff's `mapLayer()` algorithm (README.md, "Locator
// algorithm") as closely as possible: normalize coordinates with a 3°
// margin, merge schools within 4% into one marker, pick each label's side
// by pointing away from its nearest neighbour, then run an 8-pass vertical
// collision fan against estimated label boxes measured in the plot's actual
// pixel size.
export function SchoolsMap({ schools }: { schools: SchoolPoint[] }) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotSize, setPlotSize] = useState({ w: 766, h: 672 });

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPlotSize((prev) => (Math.abs(r.width - prev.w) > 1 || Math.abs(r.height - prev.h) > 1 ? { w: r.width, h: r.height } : prev));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (schools.length === 0) {
    return <p className="p-8 text-sm text-muted">Add coordinates to schools to plot the atlas.</p>;
  }

  const lons = schools.map((s) => s.lon);
  const lats = schools.map((s) => s.lat);
  const minLon = Math.min(...lons) - 3;
  const maxLon = Math.max(...lons) + 3;
  const minLat = Math.min(...lats) - 3;
  const maxLat = Math.max(...lats) + 3;
  const px = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * 100;
  const py = (lat: number) => 100 - ((lat - minLat) / (maxLat - minLat)) * 100;

  // Co-located schools (same city) share one marker so labels can never stack.
  const clusters: Cluster[] = [];
  schools.forEach((s) => {
    const hit = clusters.find((c) => Math.abs(px(c.lon) - px(s.lon)) < 4 && Math.abs(py(c.lat) - py(s.lat)) < 4);
    if (hit) {
      hit.members.push(s);
      return;
    }
    clusters.push({
      lon: s.lon,
      lat: s.lat,
      city: s.city,
      members: [s],
      x: 0,
      y: 0,
      code: "",
      place: "",
      teams: 0,
      flip: false,
      dy: 0,
    });
  });

  clusters.forEach((c) => {
    c.x = px(c.lon);
    c.y = py(c.lat);
    c.code = c.members.map((m) => m.code).join(" / ");
    c.place = c.city.split(",")[0].toUpperCase();
    c.teams = c.members.reduce((n, m) => n + m.teams, 0);
  });

  // Label side chosen per marker: point away from the nearest neighbour.
  clusters.forEach((c) => {
    let near: Cluster | null = null;
    let best = Infinity;
    clusters.forEach((o) => {
      if (o === c) return;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d < best) {
        best = d;
        near = o;
      }
    });
    c.flip = near ? (near as Cluster).x > c.x : c.x > 60;
    c.dy = 0;
  });

  // Collision pass in approximate px space: any two label boxes that still
  // intersect get fanned apart vertically.
  const PW = plotSize.w || 766;
  const PH = plotSize.h || 672;
  const boxOf = (c: Cluster) => {
    const w = 24 + Math.max(c.code.length * 8.6, (c.place.length + 11) * 7.2);
    const cx = (c.x / 100) * PW;
    const cy = (c.y / 100) * PH + c.dy;
    return c.flip ? { l: cx + 7 - w, r: cx + 7, t: cy - 21, b: cy + 21 } : { l: cx - 7, r: cx - 7 + w, t: cy - 21, b: cy + 21 };
  };
  for (let pass = 0; pass < 8; pass++) {
    let hit = false;
    clusters.forEach((a, i) => {
      clusters.slice(i + 1).forEach((b) => {
        const A = boxOf(a);
        const B = boxOf(b);
        if (A.r < B.l || B.r < A.l || A.b < B.t || B.b < A.t) return;
        hit = true;
        const up = A.t + A.b <= B.t + B.b ? a : b;
        const down = up === a ? b : a;
        up.dy -= 12;
        down.dy += 12;
      });
    });
    if (!hit) break;
  }

  const legs = [...clusters].sort((a, b) => a.x - b.x);

  return (
    <div className="relative min-h-[500px] overflow-hidden bg-surface">
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 47px, color-mix(in srgb, var(--foreground) 18%, transparent) 47px 48px), repeating-linear-gradient(90deg, transparent 0 47px, color-mix(in srgb, var(--foreground) 18%, transparent) 47px 48px)",
        }}
      />
      <div className="lattice-panel absolute inset-0 text-accent opacity-10" />

      <div ref={plotRef} className="absolute" style={{ inset: "64px 176px 78px 176px" }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {legs.slice(0, -1).map((a, i) => (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={legs[i + 1].x}
              y2={legs[i + 1].y}
              stroke="color-mix(in srgb, var(--foreground) 55%, transparent)"
              strokeWidth={2}
              strokeDasharray="8 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {clusters.map((c, i) => (
          <div
            key={i}
            className="absolute flex items-center gap-2.5"
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              transform: c.flip ? `translate(calc(-100% + 7px), calc(-50% + ${c.dy}px))` : `translate(-7px, calc(-50% + ${c.dy}px))`,
              flexDirection: c.flip ? "row-reverse" : "row",
            }}
          >
            <div
              className="h-3.5 w-3.5 flex-none bg-primary"
              style={{ boxShadow: "0 0 0 6px color-mix(in srgb, var(--primary) 22%, transparent)" }}
            />
            <div className={c.flip ? "whitespace-nowrap text-right" : "whitespace-nowrap text-left"}>
              <div className="text-[15px] font-extrabold tracking-tight">{c.code}</div>
              <div className="text-[11px] tracking-[0.06em] text-muted">
                {c.place} · {c.teams} TEAMS
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-5 left-6 text-[11px] tracking-[0.1em] text-muted">
        SCHEMATIC LOCATOR · LAT/LONG PLOT · {minLat.toFixed(1)}°–{maxLat.toFixed(1)}°N, {minLon.toFixed(1)}°–
        {maxLon.toFixed(1)}°E
      </div>
    </div>
  );
}

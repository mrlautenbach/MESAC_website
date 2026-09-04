"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type SchoolPoint = { code: string; name: string; city: string; teams: number; lat: number; lon: number };

// A real basemap (OpenStreetMap tiles via Leaflet, no API key needed)
// instead of the earlier schematic grid - schools within ~1km of each other
// (e.g. Dubai's two campuses) still share one marker so labels never stack.
export function SchoolsMap({ schools }: { schools: SchoolPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || schools.length === 0) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        attributionControl: true,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      type Cluster = { lat: number; lon: number; members: SchoolPoint[] };
      const clusters: Cluster[] = [];
      for (const s of schools) {
        const hit = clusters.find((c) => Math.hypot(c.lat - s.lat, c.lon - s.lon) < 0.05);
        if (hit) hit.members.push(s);
        else clusters.push({ lat: s.lat, lon: s.lon, members: [s] });
      }

      for (const cluster of clusters) {
        const code = cluster.members.map((m) => m.code).join(" / ");
        const place = cluster.members[0].city.split(",")[0];
        const teams = cluster.members.reduce((n, m) => n + m.teams, 0);

        const icon = L.divIcon({
          className: "",
          html: `<span style="display:block;width:14px;height:14px;background:var(--primary);box-shadow:0 0 0 6px color-mix(in srgb, var(--primary) 22%, transparent);"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        L.marker([cluster.lat, cluster.lon], { icon })
          .addTo(map)
          .bindTooltip(`<b>${code}</b><br/>${place.toUpperCase()} · ${teams} TEAMS`, {
            permanent: true,
            direction: "right",
            offset: [10, 0],
            className: "schools-map-tooltip",
          });
      }

      const bounds = L.latLngBounds(schools.map((s) => [s.lat, s.lon] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [schools]);

  if (schools.length === 0) {
    return <p className="p-8 text-sm text-muted">Add coordinates to schools to plot the atlas.</p>;
  }

  return (
    <div className="relative h-[500px]">
      <div ref={containerRef} className="absolute inset-0" />
      <style>{`
        .schools-map-tooltip {
          background: var(--background);
          border: 1px solid var(--divider);
          border-radius: 0;
          color: var(--foreground);
          font-size: 11px;
          line-height: 1.4;
          padding: 4px 8px;
          box-shadow: none;
        }
        .schools-map-tooltip::before {
          border-right-color: var(--divider);
        }
      `}</style>
    </div>
  );
}

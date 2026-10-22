"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { DayView, StopView } from "./types";
import { formatDate } from "@/lib/dates";

const COLORS = ["#2457c5", "#bc5633", "#7a4f00", "#65416f", "#497559", "#326b82", "#a3261c", "#555"];

/** Map of stops that have coordinates. Coordinates come from the AI or travelers and are approximate. */
export default function TripMap({ days, ideas }: { days: DayView[]; ideas: StopView[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  const points = days.flatMap((d, di) => d.stops.filter((s) => s.plan === d.activePlan && s.lat !== null && s.lng !== null).map((s) => ({ s, label: `${formatDate(d.date)} ${s.startTime ?? ""}`, color: COLORS[di % COLORS.length] })));
  const missing = days.reduce((a, d) => a + d.stops.filter((s) => s.lat === null || s.lng === null).length, 0) + ideas.length;

  useEffect(() => {
    if (!ref.current || !points.length) return;
    let map: import("leaflet").Map | null = null;
    (async () => {
      const L = await import("leaflet");
      map = L.map(ref.current!, { scrollWheelZoom: false });
      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
      tiles.on("tileerror", () => setTileError(true));
      tiles.addTo(map);
      const bounds = L.latLngBounds([]);
      for (const p of points) {
        const m = L.circleMarker([p.s.lat!, p.s.lng!], { radius: 8, color: "#fff", weight: 2, fillColor: p.color, fillOpacity: 1 }).addTo(map);
        const div = document.createElement("div");
        div.textContent = `${p.label} — ${p.s.title}`;
        m.bindPopup(div);
        bounds.extend([p.s.lat!, p.s.lng!]);
      }
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    })();
    return () => {
      map?.remove();
    };
  }, [points.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!points.length) return <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No stops have map coordinates yet. AI-planned stops usually include approximate coordinates; manually added ones don't.</p>;
  return (
    <div className="space-y-2">
      <div ref={ref} className="h-[60dvh] min-h-80 w-full overflow-hidden rounded-2xl border border-line" role="region" aria-label="Map of planned stops" />
      <p className="text-xs text-muted">Pins show approximate locations. {missing ? `${missing} stop(s)/idea(s) without coordinates aren't shown. ` : ""}Colors = days. {tileError ? "Map tiles couldn't load (offline or blocked)." : ""}</p>
      <ul className="flex flex-wrap gap-2 text-xs">
        {days.map((d, i) => <li key={d.id} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{formatDate(d.date)}</li>)}
      </ul>
    </div>
  );
}

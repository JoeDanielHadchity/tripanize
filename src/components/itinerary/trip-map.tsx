"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { DayView, StopView } from "./types";
import { formatDate } from "@/lib/dates";

const COLORS = ["#3f6d83", "#b55a3c", "#7a4f00", "#65416f", "#497559", "#326b82", "#a3261c", "#555"];

/** Map of stops that have coordinates. Coordinates come from the AI or travelers and are approximate. */
export default function TripMap({ days, ideas, compact = false }: { days: DayView[]; ideas: StopView[]; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tileError, setTileError] = useState(false);
  const points = days.flatMap((d, di) => d.stops.filter((s) => s.plan === d.activePlan && s.lat !== null && s.lng !== null).map((s) => ({ s, label: `${formatDate(d.date)} ${s.startTime ?? ""}`, color: COLORS[di % COLORS.length] })));
  const missing = days.reduce((a, d) => a + d.stops.filter((s) => s.lat === null || s.lng === null).length, 0) + ideas.length;
  const pointKey = points.map(p => `${p.s.id}:${p.s.lat}:${p.s.lng}:${p.label}:${p.color}`).join("|");

  useEffect(() => {
    if (!ref.current || !points.length) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !ref.current) return;
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
      cancelled = true;
      map?.remove();
    };
  }, [pointKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!points.length) return <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">Add locations to your stops to see them on the map.</p>;
  return (
    <div className="space-y-2">
      <div ref={ref} className={`${compact ? "h-96" : "h-[60dvh]"} min-h-80 w-full overflow-hidden rounded-2xl border border-line`} role="region" aria-label="Map of planned stops" />
      <p className="text-xs text-muted">Approximate locations.{missing ? ` ${missing} without coordinates.` : ""}{tileError ? " Map unavailable. Try again when online." : ""}</p>
      <ul className="flex flex-wrap gap-2 text-xs">
        {days.map((d, i) => <li key={d.id} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{formatDate(d.date)}</li>)}
      </ul>
    </div>
  );
}

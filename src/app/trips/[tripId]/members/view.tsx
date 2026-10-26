"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { useLocationSharing } from "@/components/location-sharing";
import { Badge, Button, Card, EmptyState, Notice } from "@/components/ui";
import { LOCATION_POLL_MS, type LocatedMember, type MemberLocations } from "@/lib/member-locations";

const colors = ["#3e6a8c", "#c2502f", "#7a4f00", "#65416f", "#497559", "#a3261c"];

export function MemberLocationsView({ tripId, userId }: { tripId: string; userId: string }) {
  const sharing = useLocationSharing();
  const [data, setData] = useState<MemberLocations | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.hidden || !navigator.onLine) { if (!stopped) { setData(null); setError(navigator.onLine ? "" : "You’re offline. Live locations need a connection."); } return; }
      try {
        const res = await fetch(`/api/trips/${tripId}/locations`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const next = await res.json() as MemberLocations;
        if (!stopped && !document.hidden) { setData(next); setNow(Date.now()); setError(""); }
      } catch { if (!stopped) { setData(null); setError("Couldn’t refresh live locations. Check your connection and try again."); } }
    }
    void check();
    const poll = setInterval(check, LOCATION_POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener("visibilitychange", check); window.addEventListener("offline", check); window.addEventListener("online", check);
    return () => { stopped = true; clearInterval(poll); clearInterval(clock); document.removeEventListener("visibilitychange", check); window.removeEventListener("offline", check); window.removeEventListener("online", check); };
  }, [tripId, refresh, sharing.self.sessionId]);
  const locations = (data?.locations ?? []).filter(p => new Date(p.expiresAt).getTime() > now);
  const active = Boolean(sharing.self.sessionId) || ["starting", "sharing", "paused", "stopping"].includes(sharing.phase);
  return <div className="space-y-5">
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">My location sharing</h2><p className="mt-1 text-sm text-muted">Only current members of this trip can see your shared position.</p></div><Badge tone={active ? "sage" : "neutral"}>{sharing.phase === "starting" ? "Starting…" : sharing.phase === "stopping" ? "Stopping…" : sharing.phase === "paused" ? "Updates paused" : active ? "On" : "Off"}</Badge></div>
      <p className="mt-3 text-sm text-muted">Turning it on asks your browser for location permission. Updates run about every 20 seconds while Tripanize is visible, including on other trip pages. Keep your phone unlocked and the app open for updates.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {!["sharing", "starting", "stopping", "paused"].includes(sharing.phase) && <Button variant="primary" onClick={sharing.start}>{sharing.self.sessionId ? "Share from this device" : "Turn location on"}</Button>}
        {active && <Button disabled={sharing.phase === "stopping"} onClick={sharing.stop}>Turn location off</Button>}
      </div>
      {sharing.error && <Notice tone="warn" className="mt-3">{sharing.error}</Notice>}
      <p className="mt-3 text-xs text-muted">Off by default. Turning off clears your point. We keep only the latest position, never a route history. Pins expire after two minutes without an update. Location data isn’t included in trip exports, offline copies or change emails.</p>
    </Card>
    {error && <Notice tone="warn">{error} <button type="button" className="font-semibold underline" onClick={() => setRefresh(n => n + 1)}>Retry</button></Notice>}
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-xl font-semibold">Who’s nearby</h2><Button variant="ghost" onClick={() => setRefresh(n => n + 1)}>Refresh map</Button></div>
      {locations.length ? <LiveMemberMap points={locations} userId={userId} /> : <EmptyState title={data ? "No locations shared yet" : error ? "Map unavailable" : "Loading member locations…"}>Members appear here after they turn location sharing on. You can view the map without sharing your own location.</EmptyState>}
      <p className="mt-3 text-xs text-muted">Locations are approximate. The accuracy circle shows your device’s reported uncertainty. Map tiles are provided by OpenStreetMap; loading the map requests tiles for the displayed area.</p>
    </Card>
    {data && <Card><h2 className="font-display text-xl font-semibold">Trip members</h2><ul className="mt-2 divide-y divide-line">{data.members.map(m => {
      const p = locations.find(p => p.userId === m.userId);
      const seconds = p ? Math.max(0, Math.floor((now - new Date(p.updatedAt).getTime()) / 1000)) : 0;
      return <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-3"><span className="font-medium">{m.name}{m.userId === userId ? " (you)" : ""}</span><span className="text-sm text-muted">{p ? `Updated ${seconds < 10 ? "just now" : `${seconds}s ago`} · accuracy ±${Math.max(1, Math.round(p.accuracy))} m` : "Not sharing a recent location"}</span></li>;
    })}</ul></Card>}
  </div>;
}

function LiveMemberMap({ points, userId }: { points: LocatedMember[]; userId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const layer = useRef<import("leaflet").LayerGroup | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [mapError, setMapError] = useState(false);
  const fitted = useRef(false);
  const coordinates = JSON.stringify(points);
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then(L => {
      if (cancelled || !container.current) return;
      leaflet.current = L;
      const instance = L.map(container.current, { scrollWheelZoom: false });
      map.current = instance;
      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
      tiles.on("tileerror", () => { if (!cancelled) setTileError(true); }); tiles.addTo(instance);
      layer.current = L.layerGroup().addTo(instance);
      setReady(true);
    }).catch(() => { if (!cancelled) setMapError(true); });
    return () => { cancelled = true; map.current?.remove(); map.current = null; layer.current = null; leaflet.current = null; };
  }, []);
  function fit() {
    const L = leaflet.current;
    if (L && map.current && points.length) map.current.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [35, 35], maxZoom: 15 });
  }
  useEffect(() => {
    const L = leaflet.current;
    if (!ready || !L || !layer.current) return;
    layer.current.clearLayers();
    for (const [index, p] of points.entries()) {
      const color = p.userId === userId ? "#3e6a8c" : colors[(index + 1) % colors.length];
      L.circle([p.lat, p.lng], { radius: p.accuracy, color, weight: 1, fillOpacity: 0.08 }).addTo(layer.current);
      const marker = L.circleMarker([p.lat, p.lng], { radius: 9, color: "white", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(layer.current);
      const text = document.createElement("span"); text.textContent = `${p.name}${p.userId === userId ? " (you)" : ""} · accuracy ±${Math.round(p.accuracy)} m`;
      marker.bindTooltip(text, { permanent: true, direction: "top", offset: [0, -9] });
    }
    if (!fitted.current) { fit(); fitted.current = true; }
  }, [coordinates, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="space-y-2"><div ref={container} className="relative z-0 h-[50dvh] min-h-72 overflow-hidden rounded-xl border border-line" role="region" aria-label="Map of sharing trip members" /><Button onClick={fit}>Show everyone</Button>{(tileError || mapError) && <Notice tone="warn">The map couldn’t load fully. Recent locations and accuracy are still listed below.</Notice>}</div>;
}

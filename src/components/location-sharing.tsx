"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LocationSession, emptySharing, type SharingState } from "@/lib/location-session";
import { LOCATION_POLL_MS, type LocationSelf, type MemberPosition } from "@/lib/member-locations";
import { Button, Notice } from "./ui";

type Sharing = SharingState & { start(): void; stop(): void };
const Context = createContext<Sharing | null>(null);
export function useLocationSharing() {
  const value = useContext(Context);
  if (!value) throw new Error("Location sharing needs a trip.");
  return value;
}

async function readResponse(response: Response): Promise<LocationSelf> {
  const data = await response.json() as LocationSelf & { error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(data.error ?? "Location sharing is unavailable."), { code: data.code ?? (response.status === 401 ? "UNAUTHENTICATED" : undefined) });
  return data;
}
function currentPosition(): Promise<MemberPosition> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext || !navigator.geolocation) { reject(new Error("This browser cannot share location. Open Tripanize using HTTPS on a supported phone or browser.")); return; }
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, capturedAt: new Date(p.timestamp).toISOString() }), e => {
      reject(Object.assign(new Error(e.code === 1 ? "Location permission was denied. Allow location in your browser’s site settings, then try again." : e.code === 3 ? "Getting your location timed out. Move somewhere with a clearer signal and try again." : "Your device couldn’t find its location. Please try again."), { code: e.code === 1 ? "LOCATION_DENIED" : "LOCATION_UNAVAILABLE" }));
    }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 });
  });
}

export function LocationSharingProvider({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  const ref = useRef<LocationSession | null>(null);
  const [state, setState] = useState<SharingState>(emptySharing);
  useEffect(() => {
    const endpoint = `/api/trips/${tripId}/locations`;
    const request = async (body?: object) => {
      if (!navigator.onLine) throw new Error("You’re offline.");
      return readResponse(await fetch(body ? endpoint : `${endpoint}?self=1`, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) }));
    };
    const session = new LocationSession({
      self: () => request(),
      start: (token, previous, point) => request({ op: "start", token, expectedVersion: previous.version, scope: previous.scope, ...point }),
      update: (token, point) => request({ op: "update", token, ...point }),
      stop: token => request({ op: "stop", ...(token ? { token } : {}) }),
      leave: token => { void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "stop", token }), keepalive: true, cache: "no-store" }).catch(() => undefined); },
    }, currentPosition, () => crypto.randomUUID() + crypto.randomUUID(), setState);
    ref.current = session;
    session.setVisible(!document.hidden);
    void session.tick();
    const interval = setInterval(() => { void session.tick(); }, LOCATION_POLL_MS);
    const visible = () => { session.setVisible(!document.hidden); if (!document.hidden) void session.tick(); };
    const leave = () => session.dispose();
    const resume = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", visible);
    return () => {
      clearInterval(interval); document.removeEventListener("visibilitychange", visible); window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", resume); window.removeEventListener("online", visible);
      session.dispose(); ref.current = null;
    };
  }, [tripId]);
  const active = Boolean(state.self.sessionId) || ["starting", "sharing", "paused", "stopping"].includes(state.phase);
  return <Context.Provider value={{ ...state, start: () => { void ref.current?.start(); }, stop: () => { void ref.current?.stop(); } }}>
    {active && <div className="mx-auto max-w-6xl px-4 pt-3"><Notice tone="sage"><div className="flex flex-wrap items-center justify-between gap-2"><p><Link href={`/trips/${tripId}/members`} className="font-semibold underline underline-offset-2">Member locations</Link> · {state.phase === "starting" ? "Getting your location…" : state.phase === "stopping" ? "Turning sharing off…" : state.phase === "paused" ? "Your location updates are paused" : state.phase === "sharing" ? "You’re sharing your location" : "You’re sharing from another tab or device"}</p><Button variant="ghost" disabled={state.phase === "stopping"} onClick={() => { void ref.current?.stop(); }}>Turn location off</Button></div></Notice></div>}
    {children}
  </Context.Provider>;
}

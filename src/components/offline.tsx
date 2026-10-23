"use client";

import { useEffect, useState } from "react";

const SNAPSHOT_CACHE = "tripanize-trip-snapshots";

/** Removes every cached private trip snapshot (called on sign-out). */
export async function clearOfflineData() {
  try {
    try { localStorage.setItem("tripanize:offline-epoch", crypto.randomUUID()); } catch { /* storage may be unavailable */ }
    if ("caches" in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
    localStorage.removeItem("tripanize:offline-index");
    navigator.serviceWorker?.controller?.postMessage({ type: "clear" });
  } catch {
    /* storage unavailable */
  }
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-40 bg-warn-soft px-4 py-2 text-center text-sm text-warn-ink">
      You're offline. You can read the itinerary and bookings you last synced; editing, AI planning, settling up and invitations need a connection.{" "}
      <a href="/offline" className="font-semibold underline">Open offline trips</a>
    </div>
  );
}

export function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
  return null;
}

/** Saves a read-only snapshot of a trip for offline viewing (Cache Storage, cleared on sign-out). */
export function SaveOfflineSnapshot({ tripId }: { tripId: string }) {
  useEffect(() => {
    if (!navigator.onLine || !("caches" in window)) return;
    const url = `/api/trips/${tripId}/snapshot`;
    let epoch: string | null;
    try { epoch = localStorage.getItem("tripanize:offline-epoch"); } catch { return; }
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok || epoch !== localStorage.getItem("tripanize:offline-epoch")) return;
        const cache = await caches.open(SNAPSHOT_CACHE);
        if (epoch !== localStorage.getItem("tripanize:offline-epoch")) return;
        await cache.put(url, res.clone());
        if (epoch !== localStorage.getItem("tripanize:offline-epoch")) { await cache.delete(url); return; }
        const idx = JSON.parse(localStorage.getItem("tripanize:offline-index") ?? "{}") as Record<string, string>;
        const body = (await res.json()) as { trip: { name: string } };
        idx[tripId] = body.trip.name;
        localStorage.setItem("tripanize:offline-index", JSON.stringify(idx));
      } catch {
        /* best effort */
      }
    })();
  }, [tripId]);
  return null;
}

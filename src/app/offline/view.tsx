"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/shell";
import { Badge, Notice } from "@/components/ui";
import { formatDate, formatTimestamp, todayIn } from "@/lib/dates";
import { directionsUrl } from "@/lib/maps";

type Snapshot = {
  syncedAt: string;
  trip: { id: string; name: string; startDate: string | null; endDate: string | null; timezone: string };
  days: { date: string; title: string | null; area: string | null; destination: { name: string; accommodationName: string | null; accommodationAddress: string | null } | null; notes: string | null; stops: { title: string; startTime: string | null; durationMin: number | null; address: string | null; locationName: string | null; lat: number | null; lng: number | null; status: string; fixed: boolean; booking: string | null; officialUrl: string | null }[] }[];
  bookings: { id: string; title: string; category: string; date: string | null; startTime: string | null; status: string; address: string | null; bookingUrl: string | null }[];
};

/** Read-only view of the last synced trip data, available without a connection. */
export function OfflineTrips() {
  const [index, setIndex] = useState<Record<string, string>>({});
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    try {
      setIndex(JSON.parse(localStorage.getItem("roam:offline-index") ?? "{}"));
    } catch {
      setIndex({});
    }
  }, []);
  async function open(id: string) {
    try {
      const c = await caches.open("roam-trip-snapshots");
      const r = await c.match(`/api/trips/${id}/snapshot`);
      if (r) setSnap(await r.json());
    } catch {
      setSnap(null);
    }
  }
  const today = snap ? todayIn(snap.trip.timezone) : "";
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-6">
      <Logo />
      <h1 className="mt-6 font-display text-2xl font-semibold">Offline trips</h1>
      <Notice tone="warn" className="mt-3">
        {online ? "You're online — open your trips normally for the latest information." : "You're offline."} This page shows the itinerary and booking essentials last synced on this device. It is read-only: editing, AI planning, expenses and invitations need a connection.
      </Notice>
      {!Object.keys(index).length && <p className="mt-6 text-sm text-muted">No trips have been saved on this device yet. Open a trip while online to make it available offline.</p>}
      <ul className="mt-4 flex flex-wrap gap-2">
        {Object.entries(index).map(([id, name]) => (
          <li key={id}><button type="button" onClick={() => open(id)} className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium">{name}</button></li>
        ))}
      </ul>
      {snap && (
        <section className="mt-6 space-y-5">
          <p className="text-sm text-muted">Last synced {formatTimestamp(snap.syncedAt, snap.trip.timezone)}</p>
          {snap.days.map((d) => (
            <div key={d.date} className={`rounded-2xl border bg-surface p-4 ${d.date === today ? "border-accent" : "border-line"}`}>
              <p className="text-sm text-accent-ink">{formatDate(d.date, { weekday: "long", day: "numeric", month: "long" })}{d.date === today ? " · Today" : ""}</p>
              <h2 className="font-display text-lg font-semibold">{d.title ?? d.area ?? d.destination?.name ?? ""}</h2>
              {d.destination?.accommodationName && <p className="text-sm text-muted">Staying at {d.destination.accommodationName}{d.destination.accommodationAddress ? `, ${d.destination.accommodationAddress}` : ""}</p>}
              <ol className="mt-2 space-y-2">
                {d.stops.map((s, i) => {
                  const dir = directionsUrl(s, "GOOGLE");
                  return (
                    <li key={i} className="text-sm">
                      <span className="font-mono">{s.startTime ?? "--:--"}</span> {s.title} {s.booking === "BOOKED" || s.booking === "PAID" || s.fixed ? <Badge tone="sage">Confirmed</Badge> : s.status === "SUGGESTED" ? <Badge tone="accent">Suggestion</Badge> : null}
                      {s.address && <span className="block text-muted">{s.address}</span>}
                      {dir && <a className="text-accent-ink underline" href={dir}>Directions (needs connection)</a>}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
          <div className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="font-display text-lg font-semibold">Bookings</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {snap.bookings.map((b) => <li key={b.id}>{b.date ? formatDate(b.date) : "Date not set"} {b.startTime ?? ""} — {b.title} ({b.status.toLowerCase()}){b.address ? ` · ${b.address}` : ""}</li>)}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}

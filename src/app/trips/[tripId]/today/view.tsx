"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, ExternalLink, Notice, Select, cx } from "@/components/ui";
import { useAction } from "@/components/client";
import { StopCard } from "@/components/itinerary/stop-card";
import { StopEditor } from "@/components/itinerary/stop-editor";
import { MoveDialog } from "@/components/itinerary/move-dialog";
import { SwapDialog } from "@/components/itinerary/swap-dialog";
import type { DayView, StopView } from "@/components/itinerary/types";
import { setActivePlanAction } from "@/app/actions/itinerary";
import { directionsUrl, type MapsApp } from "@/lib/maps";
import { formatDate, toMinutes } from "@/lib/dates";

type Booking = { id: string; title: string; category: string; startTime: string | null; status: string; address: string | null; bookingUrl: string | null; date: string | null; endDate: string | null; attachments: { id: string; fileName: string }[] };

export function TodayView(p: {
  tripId: string; canEdit: boolean; currency: string; defaultMapsApp: MapsApp; aiReady: boolean; isPreview: boolean; nowTime: string | null; timezone: string; date: string; tomorrow: string | null;
  days: { id: string; date: string; title: string | null }[]; day: DayView; accommodation: { name: string | null; address: string | null; checkIn: string | null; checkOut: string | null } | null;
  alerts: string[]; weatherStatus: "ok" | "unavailable" | "none"; bookings: Booking[];
}) {
  const { run, pending } = useAction();
  const [mapsApp, setMapsApp] = useState<MapsApp>(p.defaultMapsApp);
  const [editing, setEditing] = useState<StopView | null>(null);
  const [moving, setMoving] = useState<StopView | null>(null);
  const [swapping, setSwapping] = useState<StopView | null>(null);
  const [now, setNow] = useState(p.nowTime);

  useEffect(() => {
    try {
      const m = localStorage.getItem("tripanize:mapsApp");
      if (m === "GOOGLE" || m === "APPLE" || m === "OSM") setMapsApp(m);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (p.isPreview) return;
    const t = setInterval(() => setNow(new Intl.DateTimeFormat("en-GB", { timeZone: p.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())), 60_000);
    return () => clearInterval(t);
  }, [p.isPreview, p.timezone]);

  const stops = p.day.stops.filter((s) => s.plan === p.day.activePlan && s.status !== "SKIPPED");
  const skipped = p.day.stops.filter((s) => s.plan === p.day.activePlan && s.status === "SKIPPED");
  const { current, next } = useMemo(() => {
    if (!now) return { current: null, next: stops[0] ?? null };
    const n = toMinutes(now);
    const cur = stops.find((s) => s.startTime && toMinutes(s.startTime) <= n && n < toMinutes(s.startTime) + (s.durationMin ?? 60)) ?? null;
    const nxt = stops.find((s) => s.startTime && toMinutes(s.startTime) > n) ?? null;
    return { current: cur, next: nxt };
  }, [now, stops]);
  const focus = current ?? next;
  const meals = stops.filter((s) => s.isMeal && !s.booking);
  const restaurantBookings = p.bookings.filter((b) => b.category === "RESTAURANT");
  const handlers = { onEdit: setEditing, onMove: setMoving, onSwap: setSwapping };
  const confirmed = (s: string) => s === "BOOKED" || s === "PAID";

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-medium text-accent-ink">{p.isPreview ? "Preview" : "Today"}{now ? ` · ${now} local time (${p.timezone})` : ""}</p>
        <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{formatDate(p.date, { weekday: "long", day: "numeric", month: "long" })}</h1>
        <p className="text-muted">{[p.day.title, p.day.area ?? p.day.destination?.name].filter(Boolean).join(" · ")}</p>
      </header>

      {focus && (
        <Card className="border-accent bg-accent-soft/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">{current ? "Happening now" : now ? "Up next" : "First stop"}</p>
          <p className="mt-1 font-display text-2xl font-semibold leading-tight">{focus.title}</p>
          <p className="mt-1 text-sm">
            {focus.startTime ?? "No time set"}{focus.durationMin ? ` · ${focus.durationMin} min` : ""}
            {" · "}
            {focus.booking ? (confirmed(focus.booking.status) ? "Booked" : `Booking ${focus.booking.status.toLowerCase().replace("_", " ")}`) : focus.isFixed ? "Fixed commitment" : focus.status === "SUGGESTED" ? "Suggestion (not booked)" : "Planned"}
          </p>
          {focus.address && <p className="mt-1 text-sm text-muted">{focus.address}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {directionsUrl(focus, mapsApp) && <a href={directionsUrl(focus, mapsApp)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-xl bg-accent px-5 font-semibold text-on-accent">Directions</a>}
            {focus.officialUrl && <a href={focus.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-12 items-center rounded-xl border border-line bg-surface px-4 font-medium">{focus.booking ? "Tickets / booking" : "Official site"}</a>}
          </div>
        </Card>
      )}
      {!focus && stops.length > 0 && <Notice tone="accent">That's everything planned for today. Enjoy the evening.</Notice>}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Plan A or B" className="flex rounded-xl border border-line bg-surface p-0.5">
          {(["A", "B"] as const).map((pl) => (
            <button key={pl} type="button" aria-pressed={p.day.activePlan === pl} disabled={!p.canEdit || pending} onClick={() => run(() => setActivePlanAction(p.tripId, p.day.id, pl), { success: `Switched to Plan ${pl}` })} className={cx("min-h-11 rounded-lg px-4 text-sm font-medium", p.day.activePlan === pl ? "bg-accent text-on-accent" : "text-muted")}>
              Plan {pl}{pl === "B" ? " (indoor)" : ""}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-muted">Maps</span>
          <Select aria-label="Preferred maps app" className="min-h-11 w-auto" value={mapsApp} onChange={(e) => { const v = e.target.value as MapsApp; setMapsApp(v); try { localStorage.setItem("tripanize:mapsApp", v); } catch { /* ignore */ } }}>
            <option value="GOOGLE">Google Maps</option>
            <option value="APPLE">Apple Maps</option>
            <option value="OSM">OpenStreetMap</option>
          </Select>
        </label>
      </div>

      {(p.day.weather || p.alerts.length > 0 || p.weatherStatus === "unavailable") && (
        <Card>
          <h2 className="text-sm font-semibold">Weather & alerts</h2>
          {p.day.weather ? (
            <p className="mt-1 text-sm">
              <Badge tone={p.day.weather.kind === "forecast" ? "sage" : "neutral"}>{p.day.weather.kind === "forecast" ? "Forecast" : "Typical for this date — not a forecast"}</Badge>{" "}
              {p.day.weather.summary}{p.day.weather.tMax !== null ? `, ${Math.round(p.day.weather.tMax)}° / ${Math.round(p.day.weather.tMin ?? 0)}°C` : ""}{p.day.weather.precipProb !== null ? `, ${p.day.weather.precipProb}% chance of rain` : ""}
            </p>
          ) : <p className="mt-1 text-sm text-muted">Weather data is unavailable right now.</p>}
          {p.alerts.map((a) => <p key={a} className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">{a}</p>)}
          {p.day.isTravelDay && <p className="mt-2 text-sm">Travel day{p.day.driveMinutes ? ` — about ${Math.round(p.day.driveMinutes / 60)} h of driving (estimate)` : ""}. Leave buffer for breaks.</p>}
          {p.day.destination?.parkingNotes && <p className="mt-1 text-sm">Parking: {p.day.destination.parkingNotes}</p>}
        </Card>
      )}

      <section aria-labelledby="tl">
        <h2 id="tl" className="mb-2 font-display text-lg font-semibold">Timeline</h2>
        {stops.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Nothing scheduled{p.day.activePlan === "B" ? " in Plan B" : ""}. <Link className="text-accent-ink underline" href={`/trips/${p.tripId}/itinerary#day-${p.date}`}>Plan this day</Link></p>
        ) : (
          <ol className="space-y-2">
            {stops.map((s, i) => <StopCard key={s.id} s={s} next={stops[i + 1]} tripId={p.tripId} currency={p.currency} mapsApp={mapsApp} canEdit={p.canEdit} handlers={handlers} highlight={s.id === current?.id ? "now" : s.id === next?.id && !current ? "next" : null} />)}
          </ol>
        )}
        {skipped.length > 0 && <p className="mt-2 text-sm text-muted">Skipped today: {skipped.map((s) => s.title).join(", ")}</p>}
      </section>

      <section aria-labelledby="bk" className="space-y-2">
        <h2 id="bk" className="font-display text-lg font-semibold">Reservations today</h2>
        {p.bookings.length === 0 ? <p className="text-sm text-muted">No bookings recorded for today.</p> : p.bookings.map((b) => (
          <Card key={b.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{b.title}</span>
              <Badge tone={confirmed(b.status) ? "sage" : "warn"}>{confirmed(b.status) ? `✓ ${b.status === "PAID" ? "Paid" : "Booked"}` : b.status.toLowerCase().replace("_", " ")}</Badge>
            </div>
            <p className="text-sm text-muted">{[b.startTime, b.category === "ACCOMMODATION" && b.date !== p.date ? "Staying tonight" : null, b.address].filter(Boolean).join(" · ")}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {b.address && <ExternalLink href={directionsUrl({ address: b.address, title: b.title }, mapsApp)}>Directions</ExternalLink>}
              {b.bookingUrl && <ExternalLink href={b.bookingUrl}>Booking page</ExternalLink>}
              {b.attachments.map((a) => <a key={a.id} href={`/api/attachments/${a.id}`} className="text-accent-ink underline">{a.fileName}</a>)}
              <Link href={`/trips/${p.tripId}/bookings#b-${b.id}`} className="text-muted underline">Details</Link>
            </div>
          </Card>
        ))}
        {p.accommodation?.name && !p.bookings.some((b) => b.category === "ACCOMMODATION") && (
          <p className="text-sm text-muted">Tonight: {p.accommodation.name}{p.accommodation.address ? `, ${p.accommodation.address}` : ""}{p.accommodation.checkIn ? ` · check-in from ${p.accommodation.checkIn}` : ""} (from trip settings, not a recorded booking)</p>
        )}
      </section>

      <section aria-labelledby="food" className="space-y-2">
        <h2 id="food" className="font-display text-lg font-semibold">Food</h2>
        {restaurantBookings.length === 0 && meals.length === 0 && <p className="text-sm text-muted">No meals planned. <Link href={`/trips/${p.tripId}/itinerary#day-${p.date}`} className="text-accent-ink underline">Add one</Link></p>}
        {restaurantBookings.map((b) => <p key={b.id} className="text-sm"><Badge tone="sage">Confirmed booking</Badge> {b.startTime ?? ""} {b.title}</p>)}
        {meals.map((m) => <p key={m.id} className="text-sm"><Badge tone="accent">Suggestion</Badge> {m.startTime ?? ""} {m.title}{m.address ? ` — ${m.address}` : ""}</p>)}
      </section>

      {(p.day.notes || p.day.questions.length > 0) && (
        <Card>
          <h2 className="text-sm font-semibold">Notes</h2>
          {p.day.notes && <p className="mt-1 whitespace-pre-line text-sm">{p.day.notes}</p>}
          {p.day.questions.map((q) => <p key={q} className="mt-1 text-sm text-accent-ink">? {q}</p>)}
        </Card>
      )}
      {p.tomorrow && <p className="text-center"><Link href={`/trips/${p.tripId}/today?date=${p.tomorrow}`} className="text-sm text-accent-ink underline">Preview tomorrow</Link></p>}

      <StopEditor open={Boolean(editing)} onClose={() => setEditing(null)} tripId={p.tripId} currency={p.currency} stop={editing} />
      <MoveDialog open={Boolean(moving)} onClose={() => setMoving(null)} tripId={p.tripId} currency={p.currency} stop={moving} days={p.days} />
      <SwapDialog open={Boolean(swapping)} onClose={() => setSwapping(null)} tripId={p.tripId} currency={p.currency} stop={swapping} aiReady={p.aiReady} />
    </div>
  );
}

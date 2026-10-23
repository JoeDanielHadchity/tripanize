"use client";
import { PremiumStar } from "@/components/premium-star";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ExternalLink, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { Dialog, useAction } from "@/components/client";
import { ackEventAction, addCustomEventAction, discoverEventsAction, discoverySettingsAction, notificationPrefsAction, previewEventAction, scheduleEventAction, setEventStatusAction } from "@/app/actions/events";
import { formatDate, formatTimestamp } from "@/lib/dates";
import { NOTIFY_CHANGE_TYPES } from "@/lib/constants";

type Ev = {
  booking: { id: string; status: string } | null;
  id: string; title: string; category: string; date: string | null; endDate: string | null; startTime: string | null; dateVerified: boolean; venue: string | null; city: string | null; address: string | null;
  officialUrl: string | null; bookingUrl: string | null; priceText: string | null; availability: string | null; bookingDeadline: string | null; whyFits: string | null; uncertainty: string | null;
  cancelled: boolean; soldOut: boolean; status: "NEW" | "SAVED" | "HIDDEN" | "SCHEDULED"; origin: string; lastCheckedAt: string | null; changes: { type: string; summary: string; at: string }[]; sources: { url: string; title: string | null }[]; scheduledDate: string | null;
};

type Props = {
  initialEventId: string | null;
  tripId: string; canEdit: boolean; aiReady: boolean; emailReady: boolean; timezone: string; days: { id: string; date: string; title: string | null }[];
  settings: { autoDiscovery: boolean; cadence: string; nextAt: string | null }; lastSuccess: string | null;
  runs: { id: string; trigger: string; status: string; error: string | null; found: number; added: number; changed: number; at: string }[];
  pref: { emailEnabled: boolean; frequency: string; changeTypes: string[] }; deliveries: { id: string; subject: string; status: string; at: string }[]; events: Ev[];
};

const TABS = [["NEW", "New"], ["SAVED", "Saved"], ["SCHEDULED", "In itinerary"], ["HIDDEN", "Hidden"]] as const;

export function EventsView(p: Props) {
  const { run, pending } = useAction();
  const [tab, setTab] = useState<Ev["status"]>(p.events.find(e => e.id === p.initialEventId)?.status ?? (p.events.some((e) => e.status === "NEW") ? "NEW" : "SAVED"));
  useEffect(() => {
    const target = p.events.find(e => e.id === p.initialEventId);
    if (target) setTab(target.status);
  }, [p.initialEventId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scheduling, setScheduling] = useState<Ev | null>(null);
  const [adding, setAdding] = useState(false);
  const [settingsFirst, setSettingsFirst] = useState(false);
  const [undo, setUndo] = useState<{ id: string; title: string; before: "NEW" | "SAVED" | "HIDDEN" | "SCHEDULED"; after: "NEW" | "SAVED" | "HIDDEN" } | null>(null);
  useEffect(() => { try { setSettingsFirst(localStorage.getItem("tripanize:event-settings-first") === "true"); } catch { /* optional preference */ } }, []);
  function changeLayout(first: boolean) {
    setSettingsFirst(first);
    try { localStorage.setItem("tripanize:event-settings-first", String(first)); } catch { /* optional preference */ }
  }
  async function changeStatus(e: Ev, status: "NEW" | "SAVED" | "HIDDEN") {
    if (e.status === "SCHEDULED" && status !== "HIDDEN") return;
    const result = await run(() => setEventStatusAction(p.tripId, e.id, status, e.status), { success: status === "HIDDEN" ? "Event hidden" : "Event saved" });
    if (result !== null) setUndo({ id: e.id, title: e.title, before: e.status, after: status });
  }
  const shown = p.events.filter((e) => e.status === tab);
  const lastRun = p.runs[0];
  const running = lastRun && (lastRun.status === "queued" || lastRun.status === "running");

  const settingsPanel = (
      <div>
      <details className="rounded-2xl border border-line bg-surface p-4" open={settingsFirst || undefined}>
        <summary className="min-h-11 cursor-pointer content-center font-medium">Discovery & alert settings</summary>
        <Button variant="ghost" className="my-2" onClick={() => changeLayout(!settingsFirst)}>{settingsFirst ? "Show events first" : "Undo layout change · settings first"}</Button>
        <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Discovery</h2>
            <p className="text-sm text-muted">Last successful check: {p.lastSuccess ? formatTimestamp(p.lastSuccess, p.timezone) : "never"}.</p>
            {lastRun?.status === "failed" && <p className="text-sm text-danger">Last check failed{lastRun.trigger === "scheduled" ? " (automatic)" : ""}: {lastRun.error}</p>}
            {lastRun?.status === "succeeded" && <p className="text-sm text-muted">Last run found {lastRun.found} relevant event(s): {lastRun.added} new, {lastRun.changed} changed.</p>}
            {running && <p className="text-sm text-accent-ink">A check is in progress… refresh this page in a minute.</p>}
          </div>
          {p.canEdit && <Button variant="primary" disabled={!p.aiReady || pending || Boolean(running)} onClick={() => run(() => discoverEventsAction(p.tripId), { success: "Check started. Results will appear in New." })}><PremiumStar className="text-current" />Check for events now</Button>}
        </div>
        {!p.aiReady && <Notice tone="warn" className="mt-3">Event discovery uses OpenAI with web search, which isn't configured on this server. Manual and automatic checks can't run; you can still add events yourself.</Notice>}
        {p.canEdit && (
          <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => discoverySettingsAction(p.tripId, { autoDiscovery: f.get("auto") === "on" }), { success: "Automatic checks updated" }); }}>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" name="auto" defaultChecked={p.settings.autoDiscovery} className="h-5 w-5" /> Check automatically</label>
            <div className="w-full rounded-xl bg-accent-soft p-4 text-sm text-accent-ink">
              <p className="font-semibold">Searches adapt as your trip gets closer</p>
              <ul className="mt-2 space-y-1"><li>30 or more days before departure: weekly, on Monday</li><li>15–29 days before departure: Mondays and Thursdays</li><li>14 days before departure through the trip: daily</li></ul>
              <p className="mt-3 font-medium">Current schedule: {p.settings.cadence}</p>
              <p className="mt-1 text-xs">Around 9 am in the trip’s time zone. Searches use your interests, questionnaire answers and saved preferences.</p>
            </div>
            <Button type="submit" disabled={pending}>Save</Button>
            <p className="w-full text-xs text-muted">Automatic checks continue while the app is closed{p.settings.autoDiscovery && p.settings.nextAt ? `; next check around ${formatTimestamp(p.settings.nextAt, p.timezone)}` : ""}. They stop after the trip ends. Results go to “New” — nothing is added to your days automatically.</p>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold">My event alerts</h2>
        <p className="mt-2 text-sm text-muted">Every trip member receives in-app alerts for new matches and event changes. Known events are not announced again unless something changes. Open an alert to see the event and its booking links.</p>
        {!p.emailReady && <Notice tone="warn" className="mt-2">Email delivery isn't set up on this server yet (Resend or SMTP), so alerts can't be sent. Your preferences are saved and nothing will be reported as sent.</Notice>}
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => notificationPrefsAction(p.tripId, { emailEnabled: f.get("email") === "on", frequency: String(f.get("freq")), changeTypes: f.getAll("types").map(String) }), { success: "Alert preferences saved" }); }}>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" name="email" defaultChecked={p.pref.emailEnabled} className="h-5 w-5" /> Also email me about event matches and changes (opt-in)</label>
          <Field label="Frequency" htmlFor="freq"><Select id="freq" name="freq" defaultValue={p.pref.frequency} className="w-auto"><option value="immediate">As soon as found</option><option value="daily">Daily digest</option></Select></Field>
          <fieldset><legend className="mb-1 text-sm font-medium">Which changes</legend>
            <div className="flex flex-wrap gap-x-4">{NOTIFY_CHANGE_TYPES.map(([v, l]) => <label key={v} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="types" value={v} defaultChecked={p.pref.changeTypes.includes(v)} className="h-5 w-5" />{l}</label>)}</div>
          </fieldset>
          <Button type="submit" disabled={pending}>Save alerts</Button>
        </form>
        {p.deliveries.length > 0 && (
          <details className="mt-3 text-sm"><summary className="cursor-pointer text-muted">Recent alert deliveries</summary>
            <ul className="mt-1 space-y-1">{p.deliveries.map((d) => <li key={d.id}>{formatTimestamp(d.at, p.timezone)} — {d.subject} — <strong>{d.status === "sent" ? "sent (accepted by email provider)" : d.status === "not_configured" ? "not sent: email not configured" : d.status === "digest" ? "waiting for daily digest" : d.status === "queued" ? "waiting for delivery" : d.status === "cancelled" ? "cancelled" : "failed"}</strong></li>)}</ul>
          </details>
        )}
      </Card>

        </div>
      </details>
      </div>
  );
  const eventsPanel = (
      <section aria-labelledby="sl" className="space-y-3">
        {undo && <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent bg-accent-soft p-3 text-sm">
          <span>“{undo.title}” {undo.after === "HIDDEN" ? "hidden" : "saved"}.</span>
          <Button disabled={pending} onClick={async () => {
            const r = await run(() => setEventStatusAction(p.tripId, undo.id, undo.before, undo.after), { success: "Event change undone" });
            if (r !== null) { setTab(undo.before); setUndo(null); }
          }}>Undo</Button>
        </div>}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="text-muted">Last checked: {p.lastSuccess ? formatTimestamp(p.lastSuccess, p.timezone) : "never"}{running ? " · Check in progress…" : ""}</p>
          {p.canEdit && <Button disabled={!p.aiReady || pending || Boolean(running)} onClick={() => run(() => discoverEventsAction(p.tripId), { success: "Check started. Results will appear in New." })}>Find events</Button>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="sl" className="font-display text-lg font-semibold">Shortlist</h2>
          {p.canEdit && <Button onClick={() => setAdding(true)}>+ Add your own event</Button>}
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Event lists">
          {TABS.map(([k, l]) => {
            const n = p.events.filter((e) => e.status === k).length;
            return <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cx("min-h-11 shrink-0 rounded-xl px-4 text-sm font-medium", tab === k ? "bg-ink text-bg" : "border border-line bg-surface text-muted")}>{l}{n ? ` (${n})` : ""}</button>;
          })}
        </div>
        <div className="mt-4 space-y-3" role="tabpanel">
          {p.events.length === 0 ? (
            <EmptyState title="No events yet">{p.aiReady ? "Run a check to find events along your route, or add one you already know about." : "Add events you already know about. Automatic discovery needs the server's OpenAI integration."}</EmptyState>
          ) : shown.length === 0 ? <p className="text-sm text-muted">Nothing in this list.</p> : shown.map((e) => (
            <Card key={e.id} id={`event-${e.id}`} className="scroll-mt-24">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium">{e.title}</h3>
                  <p className="text-sm text-muted">{e.category}{e.venue ? ` · ${e.venue}` : ""}{e.city ? `, ${e.city}` : ""}</p>
                  <p className="text-sm">{e.date ? `${formatDate(e.date)}${e.endDate && e.endDate !== e.date ? ` – ${formatDate(e.endDate)}` : ""}${e.startTime ? ` · ${e.startTime}` : ""}` : "Date unknown"} {e.date && (e.dateVerified ? <Badge tone="sage">Date verified at source</Badge> : <Badge tone="warn">Date not verified</Badge>)}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {e.origin === "user" && <Badge>Added by you</Badge>}
                  {e.booking && <Link href={`/trips/${p.tripId}/bookings#b-${e.booking.id}`} className="text-sm font-medium text-accent-ink underline">Booking: {e.booking.status === "TO_BOOK" ? "To book" : e.booking.status.toLowerCase()}</Link>}
                  {e.cancelled && <Badge tone="danger">Reported cancelled</Badge>}
                  {e.soldOut && <Badge tone="warn">Reported sold out</Badge>}
                  {e.scheduledDate && <Badge tone="sage">On {formatDate(e.scheduledDate)}</Badge>}
                </div>
              </div>
              {e.changes.length > 0 && (
                <div className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">
                  <p className="font-semibold">Changed since you last looked</p>
                  <ul className="list-disc pl-5">{e.changes.map((c, i) => <li key={i}>{c.summary} <span className="text-xs">({formatTimestamp(c.at, p.timezone)})</span></li>)}</ul>
                  {p.canEdit && <button type="button" className="mt-1 min-h-10 underline" onClick={() => run(() => ackEventAction(p.tripId, e.id))}>Mark as reviewed</button>}
                </div>
              )}
              {e.whyFits && <p className="mt-2 text-sm">{e.whyFits}</p>}
              <dl className="mt-2 grid gap-x-4 text-sm sm:grid-cols-[9rem_1fr]">
                {([["Price", e.priceText ?? "Not verified"], ["Availability", e.availability], ["Book by", e.bookingDeadline], ["Uncertain", e.uncertainty], ["Last checked", e.lastCheckedAt ? formatTimestamp(e.lastCheckedAt, p.timezone) : e.origin === "user" ? "Entered manually" : null]] as const).filter(([, v]) => v).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd>{v}</dd></div>)}
              </dl>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {e.officialUrl && <ExternalLink href={e.officialUrl}>Official page</ExternalLink>}
                {e.bookingUrl && <ExternalLink href={e.bookingUrl}>Tickets</ExternalLink>}
                {e.sources.filter((s) => s.url !== e.officialUrl).slice(0, 3).map((s) => <ExternalLink key={s.url} href={s.url}>{s.title ?? "Source"}</ExternalLink>)}
              </div>
              {p.canEdit && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                  {e.status !== "SCHEDULED" && <Button variant="primary" onClick={() => setScheduling(e)} disabled={!p.days.length || e.booking?.status === "CANCELLED"}>Add to a day</Button>}
                  {!e.booking && e.status !== "HIDDEN" && !e.cancelled && !e.soldOut && <Link href={`/trips/${p.tripId}/bookings?event=${e.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium">Add to bookings</Link>}
                  {e.status === "NEW" && <Button disabled={pending} onClick={() => changeStatus(e, "SAVED")}>Save</Button>}
                  {e.status !== "HIDDEN" && <Button variant="ghost" disabled={pending} onClick={() => changeStatus(e, "HIDDEN")}>Remove event</Button>}
                  {e.status === "HIDDEN" && <Button disabled={pending} onClick={() => changeStatus(e, "SAVED")}>Restore</Button>}
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>
  );
  return (
    <div className="flex flex-col gap-6">
      {settingsFirst && settingsPanel}
      {eventsPanel}
      {!settingsFirst && settingsPanel}
      <ScheduleDialog key={scheduling?.id ?? "none"} ev={scheduling} onClose={() => setScheduling(null)} {...p} />
      <Dialog open={adding} onClose={() => setAdding(false)} title="Add your own event">
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const s = (k: string) => String(f.get(k) || "") || null;
          const r = await run(() => addCustomEventAction(p.tripId, { title: s("title") ?? "", category: s("category") ?? "event", date: s("date"), startTime: s("time"), venue: s("venue"), city: s("city"), officialUrl: s("url"), bookingUrl: s("bookingUrl"), priceText: s("price"), notes: s("notes") }), { success: "Event added to Saved" });
          if (r !== null) { setAdding(false); setTab("SAVED"); }
        }}>
          <Field label="Title" htmlFor="ev-t" className="sm:col-span-2"><Input id="ev-t" name="title" required /></Field>
          <Field label="Date" htmlFor="ev-d"><Input id="ev-d" name="date" type="date" /></Field>
          <Field label="Time" htmlFor="ev-tm"><Input id="ev-tm" name="time" type="time" /></Field>
          <Field label="Venue" htmlFor="ev-v"><Input id="ev-v" name="venue" /></Field>
          <Field label="City" htmlFor="ev-c"><Input id="ev-c" name="city" /></Field>
          <Field label="Category" htmlFor="ev-cat"><Select id="ev-cat" name="category">{["concert", "exhibition", "performance", "festival", "sports", "market", "cultural", "other"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Price" htmlFor="ev-p"><Input id="ev-p" name="price" /></Field>
          <Field label="Official link" htmlFor="ev-u" className="sm:col-span-2"><Input id="ev-u" name="url" type="url" placeholder="https://" /></Field>
          <Field label="Tickets / booking link (optional)" htmlFor="ev-b" className="sm:col-span-2"><Input id="ev-b" name="bookingUrl" type="url" placeholder="https://" /></Field>
          <Field label="Notes" htmlFor="ev-n" className="sm:col-span-2"><Textarea id="ev-n" name="notes" /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>Add event</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

function ScheduleDialog({ ev, onClose, tripId, days }: Props & { ev: Ev | null; onClose: () => void }) {
  const { run, pending } = useAction();
  const suggested = ev?.date ? days.find((d) => d.date === ev.date)?.id ?? "" : "";
  const [dayId, setDayId] = useState(suggested);
  const [time, setTime] = useState(ev?.startTime ?? "");
  const [duration, setDuration] = useState("120");
  const [review, setReview] = useState<{ conflicts: { message: string; severity: string }[]; warnings: string[]; date: string } | null>(null);
  if (!ev) return null;
  return (
    <Dialog open onClose={onClose} title={`Add “${ev.title}” to a day`}>
      {!review ? (
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const r = await run(() => previewEventAction(tripId, ev.id, dayId, time || null, Number(duration) || 120), { refresh: false }); if (r) setReview(r); }}>
          <Field label="Day" htmlFor="sch-day"><Select id="sch-day" required value={dayId} onChange={(e) => setDayId(e.target.value)}><option value="" disabled>Choose a day</option>{days.map((d) => <option key={d.id} value={d.id}>{formatDate(d.date)}{d.title ? ` — ${d.title}` : ""}{d.date === ev.date ? " (event date)" : ""}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" htmlFor="sch-time"><Input id="sch-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            <Field label="Duration (min)" htmlFor="sch-dur"><Input id="sch-dur" type="number" min={15} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
          </div>
          <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={!dayId || pending}>Check for conflicts</Button></div>
        </form>
      ) : (
        <div className="space-y-3 text-sm">
          {review.conflicts.length === 0 && review.warnings.length === 0 && <Notice tone="accent">No conflicts with your plan for {formatDate(review.date)}.</Notice>}
          {review.conflicts.map((c, i) => <p key={i} className={c.severity === "conflict" ? "rounded-lg bg-danger-soft px-3 py-2 text-danger" : "rounded-lg bg-warn-soft px-3 py-2 text-warn-ink"}>{c.message}</p>)}
          {review.warnings.map((w, i) => <p key={i} className="rounded-lg bg-warn-soft px-3 py-2 text-warn-ink">{w}</p>)}
          <p className="text-muted">The event is added as a planned stop (not booked). Existing stops and fixed commitments are not moved — resolve any overlap yourself.</p>
          <div className="flex justify-end gap-2"><Button onClick={() => setReview(null)}>Back</Button><Button variant="primary" disabled={pending} onClick={async () => { const r = await run(() => scheduleEventAction(tripId, ev.id, dayId, time || null, Number(duration) || 120), { success: "Added to your itinerary" }); if (r !== null) onClose(); }}>{review.conflicts.length || review.warnings.length ? "Add anyway" : "Add to day"}</Button></div>
        </div>
      )}
    </Dialog>
  );
}

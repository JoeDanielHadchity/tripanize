"use client";

import { useState } from "react";
import { Button, Field, Notice, Select } from "@/components/ui";
import { useAction } from "@/components/client";
import { tripAlertsAction } from "@/app/actions/notifications";
import { NOTIFY_CHANGE_TYPES } from "@/lib/constants";
import { formatTimestamp } from "@/lib/dates";

type Delivery = { id: string; subject: string; status: string; at: string };
type Props = {
  tripId: string; email: string; verified: boolean; emailReady: boolean; timezone: string;
  changes: boolean; bookings: boolean; events: { emailEnabled: boolean; frequency: string; changeTypes: string[] } | null; deliveries: Delivery[];
};

const deliveryStatus = (s: string) => s === "sent" ? "sent" : s === "not_configured" ? "not sent: email not set up" : s === "digest" ? "waiting for the daily digest" : s === "queued" ? "waiting to send" : s === "cancelled" ? "cancelled" : "failed";

/** Trip settings › Alerts: the one place for this trip's email alerts. In-app alerts are always on. */
export function TripAlerts(p: Props) {
  const { run, pending } = useAction();
  const [changes, setChanges] = useState(p.changes);
  const [bookings, setBookings] = useState(p.bookings);
  const [events, setEvents] = useState(p.events?.emailEnabled ?? false);
  const [frequency, setFrequency] = useState(p.events?.frequency ?? "immediate");
  const [types, setTypes] = useState<string[]>(p.events?.changeTypes ?? []);
  const canEmail = p.emailReady && p.verified;
  const box = "h-5 w-5 shrink-0";
  const row = "flex min-h-11 items-start gap-3 text-sm";
  return <div id="notifications" className="space-y-4">
    <p className="text-sm text-muted">The bell always shows changes from other members, booking deadlines and event news. Choose what also comes by email to {p.email}.</p>
    {!p.emailReady && <Notice tone="warn">Email delivery is unavailable right now. In-app alerts still work.</Notice>}
    {p.emailReady && !p.verified && <Notice tone="warn">Sign in once with an email code to verify your address, then you can turn on emails.</Notice>}
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void run(() => tripAlertsAction(p.tripId, { changes, bookings, ...(p.events ? { events: { emailEnabled: events, frequency, changeTypes: types } } : {}) }), { success: "Alerts saved" }); }}>
      <label className={row}><input type="checkbox" className={box} checked={changes} onChange={e => setChanges(e.target.checked)} disabled={!changes && !canEmail} /><span><span className="block font-medium">Trip changes</span><span className="block text-muted">An email after each change someone else makes to the trip.</span></span></label>
      <label className={row}><input type="checkbox" className={box} checked={bookings} onChange={e => setBookings(e.target.checked)} disabled={!bookings && !canEmail} /><span><span className="block font-medium">Booking deadlines</span><span className="block text-muted">An email 24 hours before a booking deadline, and at the deadline.</span></span></label>
      {p.events && <>
        <label className={row}><input type="checkbox" className={box} checked={events} onChange={e => setEvents(e.target.checked)} disabled={!events && !canEmail} /><span><span className="block font-medium">Events</span><span className="block text-muted">An email about new events that fit your trip, and changes to saved ones.</span></span></label>
        {events && <div className="space-y-3 pl-8">
          <Field label="How often" htmlFor="alerts-freq"><Select id="alerts-freq" value={frequency} onChange={e => setFrequency(e.target.value)} className="w-auto"><option value="immediate">As soon as found</option><option value="daily">Daily digest</option></Select></Field>
          <fieldset><legend className="mb-1 text-sm font-medium">Which event changes</legend>
            <div className="flex flex-wrap gap-x-4">{NOTIFY_CHANGE_TYPES.map(([v, l]) => <label key={v} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className={box} checked={types.includes(v)} onChange={e => setTypes(t => e.target.checked ? [...t, v] : t.filter(x => x !== v))} />{l}</label>)}</div>
          </fieldset>
        </div>}
      </>}
      <Button type="submit" variant="primary" disabled={pending}>Save alerts</Button>
    </form>
    {p.deliveries.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted">Recent alert emails</summary>
      <ul className="mt-1 space-y-1">{p.deliveries.map(d => <li key={d.id}>{formatTimestamp(d.at, p.timezone)} · {d.subject} · <strong>{deliveryStatus(d.status)}</strong></li>)}</ul>
    </details>}
  </div>;
}

"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, Field, Input, Notice, Select, Textarea, cx } from "./ui";
import { useAction, useConfirm } from "./client";
import { DateRangeCalendar } from "./date-range";
import { createTripAction, previewTripChangeAction, updateTripAction } from "@/app/actions/trips";
import { CURRENCIES } from "@/lib/money";
import { INTERESTS, TRANSPORT } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import type { TripInput } from "@/server/trips/schemas";

type Dest = NonNullable<TripInput["destinations"]>[number];
type Commit = { title: string; date: string; startTime: string; durationMin: string; location: string };

export type TripFormInitial = Partial<Omit<TripInput, "commitments">> & { version?: number };

const emptyDest = (): Dest => ({ name: "", country: "", arriveDate: "", departDate: "", accommodationName: "", accommodationAddress: "", neighborhood: "", checkInTime: "", checkOutTime: "", parkingNotes: "" });

function Section({ title, hint, children, open }: { title: string; hint?: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 sm:px-5">
        <span>
          <span className="font-display text-lg font-semibold">{title}</span>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
        <span aria-hidden className="text-muted transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-4 border-t border-line px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}

function Chips({ options, value, onChange, label }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className={cx("inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm", on ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface text-muted")}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} />
              {on ? "✓ " : ""}
              {o}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{label}</p>
      <ul className="mb-2 flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
            {i}
            <button type="button" aria-label={`Remove ${i}`} className="grid h-8 w-8 place-items-center rounded-full hover:bg-line" onClick={() => onChange(items.filter((x) => x !== i))}>✕</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} aria-label={label} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button onClick={add}>Add</Button>
      </div>
    </div>
  );
}

export function TripForm({ mode, tripId, initial, canEdit = true }: { mode: "create" | "edit"; tripId?: string; initial?: TripFormInitial; canEdit?: boolean }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [t, setT] = useState({
    name: initial?.name ?? "",
    startDate: initial?.startDate ?? "",
    endDate: initial?.endDate ?? "",
    timezone: initial?.timezone ?? "",
    currency: initial?.currency ?? "EUR",
    budget: initial?.budget ?? "",
    pace: initial?.pace ?? "BALANCED",
    interests: initial?.interests ?? [],
    transport: initial?.transport ?? [],
    accessibility: initial?.accessibility ?? "",
    preferences: initial?.preferences ?? "",
    dietary: initial?.dietary ?? "",
    restaurantPrefs: initial?.restaurantPrefs ?? "",
    departureCity: initial?.departureCity ?? "",
    arrivalLocation: initial?.arrivalLocation ?? "",
    arrivalAt: initial?.arrivalAt ?? "",
    departureLocation: initial?.departureLocation ?? "",
    departureAt: initial?.departureAt ?? "",
    adults: String(initial?.adults ?? 1),
    children: String(initial?.children ?? 0),
    isRoadTrip: initial?.isRoadTrip ?? false,
    carPickupLocation: initial?.carPickupLocation ?? "",
    carPickupAt: initial?.carPickupAt ?? "",
    carReturnLocation: initial?.carReturnLocation ?? "",
    carReturnAt: initial?.carReturnAt ?? "",
    notes: initial?.notes ?? "",
  });
  const [dests, setDests] = useState<Dest[]>(initial?.destinations?.length ? initial.destinations.map((d) => ({ ...emptyDest(), ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? ""])) })) : [emptyDest()]);
  const [travelers, setTravelers] = useState<string[]>([]);
  const [mustSee, setMustSee] = useState<string[]>(initial?.mustSee ?? []);
  const [optional, setOptional] = useState<string[]>(initial?.optional ?? []);
  const [commits, setCommits] = useState<Commit[]>([]);
  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => setT((x) => ({ ...x, [k]: v }));
  const multi = dests.length > 1;

  function payload(): TripInput {
    return {
      ...t,
      adults: Number(t.adults) || 1,
      children: Number(t.children) || 0,
      timezone: t.timezone || null,
      destinations: dests.filter((d) => d.name?.trim()).map((d) => ({ ...d, arriveDate: multi ? d.arriveDate : null, departDate: multi ? d.departDate : null })),
      travelers: travelers.map((name) => ({ name, isChild: false })),
      mustSee,
      optional,
      commitments: commits.filter((c) => c.title.trim()).map((c) => ({ title: c.title, date: c.date, startTime: c.startTime || null, durationMin: c.durationMin ? Number(c.durationMin) : null, location: c.location || null })),
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = payload();
    if (mode === "create") {
      const r = await run(() => createTripAction(data), { onError: (r) => setError(r.error), refresh: false });
      if (r) router.push(`/trips/${r.id}/plan?start=1`);
      return;
    }
    const preview = await run(() => previewTripChangeAction(tripId!, data), { onError: (r) => setError(r.error), refresh: false });
    if (!preview) return;
    const lines: string[] = [];
    for (const d of preview.removedDays) lines.push(`${formatDate(d.date)} is no longer in the trip${d.stops ? ` — its ${d.stops} stop(s) will move to Unscheduled ideas` : ""}.`);
    for (const d of preview.changedDays) lines.push(`${formatDate(d.date)} changes from ${d.from ?? "no destination"} to ${d.to ?? "no destination"}${d.stops ? ` (${d.stops} planned stop(s) may need review)` : ""}.`);
    for (const b of preview.bookingsOutside) lines.push(`Booking “${b.title}” (${b.status.toLowerCase()}) on ${b.date} falls outside the new dates — it stays in the booking tracker but won't appear in a day.`);
    if (lines.length) {
      const ok = await confirm({ title: "Review the impact of these changes", message: <ul className="list-disc space-y-1 pl-5">{lines.map((l) => <li key={l}>{l}</li>)}</ul>, confirmLabel: "Save changes" });
      if (!ok) return;
    }
    await run(() => updateTripAction(tripId!, data, initial?.version ?? 1), { success: "Trip details saved", onError: (r) => setError(r.error) });
  }

  return (
    <form onSubmit={submit} className="space-y-4" aria-describedby={error ? "trip-form-error" : undefined}>
      <fieldset disabled={!canEdit || pending} className="space-y-4">
        <Section title="Where and when" hint="The essentials. Everything else can be added later." open>
          <Field label="Trip name" htmlFor="name">
            <Input id="name" required value={t.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Summer in Portugal" maxLength={120} />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">Trip dates</p>
            <DateRangeCalendar start={t.startDate ?? ""} end={t.endDate ?? ""} onChange={(a, b) => setT((x) => ({ ...x, startDate: a, endDate: b }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="startDate"><Input id="startDate" type="date" value={t.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} /></Field>
            <Field label="End date" htmlFor="endDate"><Input id="endDate" type="date" value={t.endDate ?? ""} min={t.startDate ?? undefined} onChange={(e) => set("endDate", e.target.value)} /></Field>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">{multi ? "Destinations, in order" : "Destination"}</p>
            {dests.map((d, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-line p-3">
                <div className="flex items-end gap-2">
                  <Field label={multi ? `Stop ${i + 1}` : "City or region"} htmlFor={`dest-${i}`} className="flex-1">
                    <Input id={`dest-${i}`} value={d.name ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="e.g. Lisbon" />
                  </Field>
                  {multi && (
                    <div className="flex gap-1">
                      <Button aria-label={`Move ${d.name || "destination"} up`} disabled={i === 0} onClick={() => setDests(dests.map((x, j) => (j === i - 1 ? dests[i] : j === i ? dests[i - 1] : x)))}>↑</Button>
                      <Button aria-label={`Remove ${d.name || "destination"}`} onClick={() => setDests(dests.filter((_, j) => j !== i))}>✕</Button>
                    </div>
                  )}
                </div>
                {multi && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Arrive" htmlFor={`arr-${i}`}><Input id={`arr-${i}`} type="date" value={d.arriveDate ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, arriveDate: e.target.value } : x)))} /></Field>
                    <Field label="Leave" htmlFor={`dep-${i}`}><Input id={`dep-${i}`} type="date" value={d.departDate ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, departDate: e.target.value } : x)))} /></Field>
                  </div>
                )}
                <details>
                  <summary className="cursor-pointer text-sm text-accent-ink">Where you're staying (optional)</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Accommodation" htmlFor={`acc-${i}`}><Input id={`acc-${i}`} value={d.accommodationName ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, accommodationName: e.target.value } : x)))} /></Field>
                    <Field label="Neighborhood or overnight stop" htmlFor={`nb-${i}`}><Input id={`nb-${i}`} value={d.neighborhood ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, neighborhood: e.target.value } : x)))} /></Field>
                    <Field label="Address" htmlFor={`addr-${i}`} className="sm:col-span-2"><Input id={`addr-${i}`} value={d.accommodationAddress ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, accommodationAddress: e.target.value } : x)))} /></Field>
                    <Field label="Check-in time" htmlFor={`ci-${i}`}><Input id={`ci-${i}`} type="time" value={d.checkInTime ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, checkInTime: e.target.value } : x)))} /></Field>
                    <Field label="Check-out time" htmlFor={`co-${i}`}><Input id={`co-${i}`} type="time" value={d.checkOutTime ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, checkOutTime: e.target.value } : x)))} /></Field>
                    {t.isRoadTrip && <Field label="Parking notes" htmlFor={`park-${i}`} className="sm:col-span-2"><Input id={`park-${i}`} value={d.parkingNotes ?? ""} onChange={(e) => setDests(dests.map((x, j) => (j === i ? { ...x, parkingNotes: e.target.value } : x)))} /></Field>}
                  </div>
                </details>
              </div>
            ))}
            <Button onClick={() => setDests([...dests, emptyDest()])}>+ Add another destination</Button>
            {multi && <p className="text-xs text-muted">For multi-city trips, set the dates you'll spend in each place. On a moving day, use the same date as “leave” for one place and “arrive” for the next.</p>}
          </div>
        </Section>

        <Section title="Who's going" hint="Names let you split expenses and invite people later.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Adults" htmlFor="adults"><Input id="adults" type="number" min={1} max={50} value={t.adults} onChange={(e) => set("adults", e.target.value)} /></Field>
            <Field label="Children" htmlFor="children"><Input id="children" type="number" min={0} max={50} value={t.children} onChange={(e) => set("children", e.target.value)} /></Field>
          </div>
          {mode === "create" ? <ListEditor label="Other travelers' names (you're added automatically)" items={travelers} onChange={setTravelers} placeholder="e.g. Sam" /> : <p className="text-sm text-muted">Manage traveler names and invitations under “Travelers & sharing” below.</p>}
        </Section>

        <Section title="Travel style & budget">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Pace</legend>
            <div className="grid grid-cols-3 gap-2">
              {(["RELAXED", "BALANCED", "AMBITIOUS"] as const).map((p) => (
                <label key={p} className={cx("flex min-h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium", t.pace === p ? "border-accent bg-accent-soft text-accent-ink" : "border-line")}>
                  <input type="radio" name="pace" className="sr-only" checked={t.pace === p} onChange={() => set("pace", p)} />
                  {p[0] + p.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
          </fieldset>
          <Chips label="Interests" options={INTERESTS} value={t.interests ?? []} onChange={(v) => set("interests", v)} />
          <Chips label="Preferred transport" options={TRANSPORT} value={t.transport ?? []} onChange={(v) => set("transport", v)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Overall budget (optional)" htmlFor="budget" hint="For the whole group."><Input id="budget" inputMode="decimal" value={t.budget ?? ""} onChange={(e) => set("budget", e.target.value)} placeholder="e.g. 2500" /></Field>
            <Field label="Planning currency" htmlFor="currency"><Select id="currency" value={t.currency} onChange={(e) => set("currency", e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          </div>
        </Section>

        <Section title="Getting there & around" hint="Arrival and departure times help the AI avoid impossible first and last days.">
          <Field label="Departing from" htmlFor="departureCity"><Input id="departureCity" value={t.departureCity ?? ""} onChange={(e) => set("departureCity", e.target.value)} placeholder="e.g. London" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Arrival place" htmlFor="arrivalLocation"><Input id="arrivalLocation" value={t.arrivalLocation ?? ""} onChange={(e) => set("arrivalLocation", e.target.value)} placeholder="e.g. LIS airport" /></Field>
            <Field label="Arrival (local time)" htmlFor="arrivalAt"><Input id="arrivalAt" type="datetime-local" value={t.arrivalAt ?? ""} onChange={(e) => set("arrivalAt", e.target.value)} /></Field>
            <Field label="Departure place" htmlFor="departureLocation"><Input id="departureLocation" value={t.departureLocation ?? ""} onChange={(e) => set("departureLocation", e.target.value)} placeholder="e.g. OPO airport" /></Field>
            <Field label="Departure (local time)" htmlFor="departureAt"><Input id="departureAt" type="datetime-local" value={t.departureAt ?? ""} onChange={(e) => set("departureAt", e.target.value)} /></Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={t.isRoadTrip} onChange={(e) => set("isRoadTrip", e.target.checked)} />
            This is a road trip (rental or own car)
          </label>
          {t.isRoadTrip && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Car pickup place" htmlFor="cpl"><Input id="cpl" value={t.carPickupLocation ?? ""} onChange={(e) => set("carPickupLocation", e.target.value)} /></Field>
              <Field label="Pickup time" htmlFor="cpa"><Input id="cpa" type="datetime-local" value={t.carPickupAt ?? ""} onChange={(e) => set("carPickupAt", e.target.value)} /></Field>
              <Field label="Car return place" htmlFor="crl"><Input id="crl" value={t.carReturnLocation ?? ""} onChange={(e) => set("carReturnLocation", e.target.value)} /></Field>
              <Field label="Return time" htmlFor="cra"><Input id="cra" type="datetime-local" value={t.carReturnAt ?? ""} onChange={(e) => set("carReturnAt", e.target.value)} /></Field>
            </div>
          )}
          <Field label="Time zone" htmlFor="tz" hint="Leave blank to detect it from your first destination. Used for “Today” and timestamps."><Input id="tz" value={t.timezone ?? ""} onChange={(e) => set("timezone", e.target.value)} placeholder="e.g. Europe/Lisbon" /></Field>
        </Section>

        <Section title="Places & commitments" hint="Must-sees are never silently dropped by the planner.">
          <ListEditor label="Must-see places" items={mustSee} onChange={setMustSee} placeholder="e.g. Jerónimos Monastery" />
          <ListEditor label="Nice-to-have places" items={optional} onChange={setOptional} placeholder="e.g. LX Factory" />
          {mode === "create" ? (
            <div className="space-y-3">
              <p className="text-sm font-medium">Fixed commitments (weddings, meetings, tours you already have)</p>
              {commits.map((c, i) => (
                <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-6">
                  <Input aria-label="Commitment" className="sm:col-span-2" value={c.title} placeholder="What" onChange={(e) => setCommits(commits.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                  <Input aria-label="Date" type="date" value={c.date} min={t.startDate ?? undefined} max={t.endDate ?? undefined} onChange={(e) => setCommits(commits.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
                  <Input aria-label="Start time" type="time" value={c.startTime} onChange={(e) => setCommits(commits.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} />
                  <Input aria-label="Duration in minutes" type="number" min={5} placeholder="Minutes" value={c.durationMin} onChange={(e) => setCommits(commits.map((x, j) => (j === i ? { ...x, durationMin: e.target.value } : x)))} />
                  <Button aria-label="Remove commitment" onClick={() => setCommits(commits.filter((_, j) => j !== i))}>✕</Button>
                  <Input aria-label="Location" className="sm:col-span-6" value={c.location} placeholder="Where (optional)" onChange={(e) => setCommits(commits.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))} />
                </div>
              ))}
              <Button onClick={() => setCommits([...commits, { title: "", date: t.startDate ?? "", startTime: "", durationMin: "", location: "" }])} disabled={!t.startDate}>+ Add a fixed commitment</Button>
              {!t.startDate && <p className="text-xs text-muted">Set trip dates first.</p>}
            </div>
          ) : (
            <p className="text-sm text-muted">Fixed commitments live in the itinerary — add or edit them there (marked “Fixed”).</p>
          )}
        </Section>

        <Section title="Food, access & preferences" hint="Only share what you're comfortable with. It's used to tailor plans for this trip.">
          <Field label="Accessibility needs" htmlFor="acc"><Textarea id="acc" value={t.accessibility ?? ""} onChange={(e) => set("accessibility", e.target.value)} placeholder="e.g. avoid long stairs, need step-free access" /></Field>
          <Field label="Dietary requirements" htmlFor="diet"><Input id="diet" value={t.dietary ?? ""} onChange={(e) => set("dietary", e.target.value)} placeholder="e.g. vegetarian, nut allergy" /></Field>
          <Field label="Restaurant preferences" htmlFor="rest"><Input id="rest" value={t.restaurantPrefs ?? ""} onChange={(e) => set("restaurantPrefs", e.target.value)} placeholder="e.g. casual local places, one special dinner" /></Field>
          <Field label="Other preferences" htmlFor="prefs"><Textarea id="prefs" value={t.preferences ?? ""} onChange={(e) => set("preferences", e.target.value)} placeholder="e.g. early risers, no museums on sunny days" /></Field>
          <Field label="Notes" htmlFor="notes"><Textarea id="notes" value={t.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        </Section>
      </fieldset>

      {error && <Notice tone="danger"><span id="trip-form-error">{error}</span></Notice>}
      {canEdit && (
        <div className="sticky bottom-20 z-10 flex justify-end lg:bottom-4">
          <Button type="submit" variant="primary" disabled={pending} className="shadow-lg">
            {pending ? "Saving…" : mode === "create" ? "Create trip" : "Save trip details"}
          </Button>
        </div>
      )}
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, Notice, Select, Textarea, cx } from "./ui";
import { useAction } from "./client";
import { DateRangeCalendar } from "./date-range";
import { Chips, ListEditor } from "./trip-form";
import { startTripAction } from "@/app/actions/onboarding";
import { CURRENCIES } from "@/lib/money";
import { INTERESTS, TRANSPORT } from "@/lib/constants";
import { GROUPS, PACES, WIZARD_STEPS, dateRangeLabel, emptyWizardDest, firstWizardProblem, peopleLabel, splitStays, suggestTripName, wizardStepError, type WizardDest } from "@/lib/trip-wizard";

type Pace = (typeof PACES)[number]["id"];

// Multi-city: each city's days start as an even split of the trip, redone when the dates or cities change.
const resplit = (ds: WizardDest[], start: string, end: string) =>
  ds.filter(d => d.name.trim()).length > 1 && start && end && end >= start ? splitStays(ds.map(d => ({ ...d, arriveDate: "", departDate: "" })), start, end) : ds;

/** Create a trip, one question per screen: Back / Next, Skip on optional steps, Create trip at the end. */
export function TripWizard({ trial }: { trial?: { invitationId: string; durationDays: number | null } }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dests, setDests] = useState<WizardDest[]>([emptyWizardDest()]);
  const [t, setT] = useState({
    startDate: "", endDate: "", timezone: "", adults: 1, children: 0, pace: "BALANCED" as Pace, currency: "EUR", budget: "",
    departureCity: "", arrivalLocation: "", arrivalAt: "", departureLocation: "", departureAt: "",
    isRoadTrip: false, carPickupLocation: "", carPickupAt: "", carReturnLocation: "", carReturnAt: "",
    accessibility: "", dietary: "", restaurantPrefs: "", preferences: "", notes: "",
  });
  const [interests, setInterests] = useState<string[]>([]), [transport, setTransport] = useState<string[]>([]);
  const [travelers, setTravelers] = useState<string[]>([]), [mustSee, setMustSee] = useState<string[]>([]), [optional, setOptional] = useState<string[]>([]);
  const [name, setName] = useState(""), [nameTouched, setNameTouched] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const set = <K extends keyof typeof t>(k: K, v: (typeof t)[K]) => { setError(null); setT(x => ({ ...x, [k]: v })); };
  const setDest = (i: number, patch: Partial<WizardDest>) => { setError(null); setDests(ds => ds.map((d, j) => j === i ? { ...d, ...patch } : d)); };
  const current = WIZARD_STEPS[step];
  const named = dests.filter(d => d.name.trim());
  const multi = named.length > 1;
  const shownName = nameTouched ? name : suggestTripName(dests, t.startDate);
  const check = { dests, startDate: t.startDate, endDate: t.endDate, adults: t.adults, name: shownName };

  // Each new step starts at the top, with its question announced to screen readers.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo({ top: 0, behavior: "smooth" }); heading.current?.focus();
  }, [step]);

  const go = (to: number) => { setError(null); setStep(Math.max(0, Math.min(WIZARD_STEPS.length - 1, to))); };
  function next(e?: FormEvent) {
    e?.preventDefault();
    const problem = wizardStepError(current.id, check);
    if (problem) { setError(problem); return; }
    if (current.id === "where") setDests(ds => resplit(ds, t.startDate, t.endDate));
    if (current.id === "ready") { void create(); return; }
    go(step + 1);
  }

  async function create() {
    const problem = firstWizardProblem(check);
    if (problem) { setStep(problem.index); setError(problem.error); return; }
    setError(null);
    const data = {
      ...t, name: shownName.trim(), timezone: t.timezone.trim() || null, interests, transport,
      destinations: named.map(d => ({ ...d, arriveDate: multi ? d.arriveDate : null, departDate: multi ? d.departDate : null })),
      travelers: travelers.map(n => ({ name: n, isChild: false })), mustSee, optional, commitments: [],
    };
    const r = await run(() => startTripAction(data, trial?.invitationId), { onError: r => setError(r.error), refresh: false });
    if (r) { if (r.trial) window.location.assign(r.next); else router.push(r.next); }
  }

  const filled: Record<string, boolean> = {
    style: interests.length > 0 || transport.length > 0 || t.pace !== "BALANCED",
    budget: Boolean(t.budget.trim()),
    getting: Boolean(t.departureCity || t.arrivalLocation || t.arrivalAt || t.departureLocation || t.departureAt || t.isRoadTrip || t.timezone || dests.some(d => d.accommodationName || d.accommodationAddress || d.neighborhood)),
    places: mustSee.length + optional.length > 0,
    food: Boolean(t.accessibility || t.dietary || t.restaurantPrefs || t.preferences || t.notes),
  };
  const isLast = current.id === "ready";

  return (
    <form onSubmit={next} noValidate className="pb-28" aria-describedby={error ? "wizard-error" : undefined}>
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-accent-ink">
          <span>Step {step + 1} of {WIZARD_STEPS.length}</span>
          {current.optional && <span className="text-muted normal-case tracking-normal font-medium">Optional</span>}
        </div>
        <div className="flex gap-1" aria-hidden>
          {WIZARD_STEPS.map((s, i) => <span key={s.id} className={cx("h-1.5 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-line")} />)}
        </div>
      </div>

      <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-extrabold tracking-tight outline-none focus-visible:outline-none sm:text-4xl">{current.title}</h1>
      <p className="mb-6 mt-2 text-muted">{current.hint}</p>

      <fieldset disabled={pending} className="min-w-0 space-y-5">
        {current.id === "where" && <>
          {dests.map((d, i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-end gap-2">
                <Field label={dests.length > 1 ? `City ${i + 1}` : "City or region"} htmlFor={`dest-${i}`} className="flex-1">
                  <Input id={`dest-${i}`} autoFocus={i === dests.length - 1} value={d.name} onChange={e => setDest(i, { name: e.target.value })} placeholder="e.g. Lisbon" maxLength={160} />
                </Field>
                {dests.length > 1 && <div className="flex gap-1">
                  <Button aria-label={`Move ${d.name || "city"} up`} disabled={i === 0} onClick={() => setDests(ds => ds.map((x, j) => j === i - 1 ? ds[i] : j === i ? ds[i - 1] : x))}>↑</Button>
                  <Button aria-label={`Remove ${d.name || "city"}`} onClick={() => setDests(ds => ds.filter((_, j) => j !== i))}>✕</Button>
                </div>}
              </div>
              <Field label="Country (optional)" htmlFor={`country-${i}`}><Input id={`country-${i}`} value={d.country} onChange={e => setDest(i, { country: e.target.value })} placeholder="e.g. Portugal" /></Field>
            </div>
          ))}
          <Button onClick={() => setDests(ds => [...ds, emptyWizardDest()])}>+ Add another city</Button>
          <p className="text-sm text-muted">Still deciding? <Link href="/destinations" className="font-semibold text-accent-ink underline underline-offset-2">Find a destination</Link></p>
        </>}

        {current.id === "when" && <>
          <DateRangeCalendar start={t.startDate} end={t.endDate} onChange={(a, b) => { setError(null); setT(x => ({ ...x, startDate: a, endDate: b })); setDests(ds => resplit(ds, a, b)); }} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date" htmlFor="startDate" className="min-w-0"><Input id="startDate" type="date" className="min-w-0" value={t.startDate} onChange={e => { set("startDate", e.target.value); setDests(ds => resplit(ds, e.target.value, t.endDate)); }} /></Field>
            <Field label="End date" htmlFor="endDate" className="min-w-0"><Input id="endDate" type="date" className="min-w-0" value={t.endDate} min={t.startDate || undefined} onChange={e => { set("endDate", e.target.value); setDests(ds => resplit(ds, t.startDate, e.target.value)); }} /></Field>
          </div>
          {multi && t.startDate && t.endDate && <div className="space-y-3">
            <p className="text-sm font-medium">Days in each city</p>
            {dests.map((d, i) => d.name.trim() && <div key={i} className="space-y-2 rounded-2xl border border-line bg-surface p-3">
              <p className="font-semibold">{d.name}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Arrive" htmlFor={`arr-${i}`} className="min-w-0"><Input id={`arr-${i}`} type="date" className="min-w-0" min={t.startDate} max={t.endDate} value={d.arriveDate} onChange={e => setDest(i, { arriveDate: e.target.value })} /></Field>
                <Field label="Leave" htmlFor={`dep-${i}`} className="min-w-0"><Input id={`dep-${i}`} type="date" className="min-w-0" min={t.startDate} max={t.endDate} value={d.departDate} onChange={e => setDest(i, { departDate: e.target.value })} /></Field>
              </div>
            </div>)}
            <Button onClick={() => setDests(ds => resplit(ds, t.startDate, t.endDate))}>Split the days evenly</Button>
            <p className="text-xs text-muted">On a moving day, use the same date to leave one city and arrive in the next.</p>
          </div>}
        </>}

        {current.id === "who" && <>
          <div className="grid grid-cols-2 gap-3">
            {GROUPS.map(g => { const on = t.adults === g.adults && t.children === g.children; return (
              <button key={g.id} type="button" aria-pressed={on} onClick={() => setT(x => ({ ...x, adults: g.adults, children: g.children }))}
                className={cx("min-h-16 rounded-2xl border px-4 text-left", on ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface hover:bg-surface-2")}>
                <span className="block font-display text-lg font-semibold">{g.label}</span>
                <span className="block text-xs text-muted">{peopleLabel(g.adults, g.children)}</span>
              </button>); })}
          </div>
          <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
            <Stepper label="Adults" value={t.adults} min={1} onChange={v => set("adults", v)} />
            <Stepper label="Children" value={t.children} min={0} onChange={v => set("children", v)} />
          </div>
          <ListEditor label="Names of the others (optional, you're added automatically)" items={travelers} onChange={setTravelers} placeholder="e.g. Sam" />
        </>}

        {current.id === "style" && <>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Pace</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PACES.map(p => (
                <label key={p.id} className={cx("flex min-h-16 cursor-pointer flex-col justify-center rounded-2xl border px-4 py-2", t.pace === p.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line bg-surface")}>
                  <input type="radio" name="pace" className="sr-only" checked={t.pace === p.id} onChange={() => set("pace", p.id)} />
                  <span className="font-semibold">{p.label}</span><span className="text-xs text-muted">{p.hint}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Chips label="What do you enjoy?" options={INTERESTS} value={interests} onChange={setInterests} />
          <Chips label="Getting around" options={TRANSPORT} value={transport} onChange={setTransport} />
        </>}

        {current.id === "budget" && <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field label="Budget for the whole group" htmlFor="budget"><Input id="budget" autoFocus inputMode="decimal" value={t.budget} onChange={e => set("budget", e.target.value)} placeholder="e.g. 2500" /></Field>
          <Field label="Currency" htmlFor="currency"><Select id="currency" value={t.currency} onChange={e => set("currency", e.target.value)}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</Select></Field>
        </div>}

        {current.id === "getting" && <>
          <Field label="Departing from" htmlFor="departureCity"><Input id="departureCity" value={t.departureCity} onChange={e => set("departureCity", e.target.value)} placeholder="e.g. London" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Arriving at" htmlFor="arrivalLocation"><Input id="arrivalLocation" value={t.arrivalLocation} onChange={e => set("arrivalLocation", e.target.value)} placeholder="e.g. LIS airport" /></Field>
            <Field label="Arrival (local time)" htmlFor="arrivalAt"><Input id="arrivalAt" type="datetime-local" value={t.arrivalAt} onChange={e => set("arrivalAt", e.target.value)} /></Field>
            <Field label="Leaving from" htmlFor="departureLocation"><Input id="departureLocation" value={t.departureLocation} onChange={e => set("departureLocation", e.target.value)} placeholder="e.g. OPO airport" /></Field>
            <Field label="Departure (local time)" htmlFor="departureAt"><Input id="departureAt" type="datetime-local" value={t.departureAt} onChange={e => set("departureAt", e.target.value)} /></Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={t.isRoadTrip} onChange={e => set("isRoadTrip", e.target.checked)} />
            This is a road trip (rental or own car)
          </label>
          {t.isRoadTrip && <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Car pickup place" htmlFor="cpl"><Input id="cpl" value={t.carPickupLocation} onChange={e => set("carPickupLocation", e.target.value)} /></Field>
            <Field label="Pickup time" htmlFor="cpa"><Input id="cpa" type="datetime-local" value={t.carPickupAt} onChange={e => set("carPickupAt", e.target.value)} /></Field>
            <Field label="Car return place" htmlFor="crl"><Input id="crl" value={t.carReturnLocation} onChange={e => set("carReturnLocation", e.target.value)} /></Field>
            <Field label="Return time" htmlFor="cra"><Input id="cra" type="datetime-local" value={t.carReturnAt} onChange={e => set("carReturnAt", e.target.value)} /></Field>
          </div>}
          <Field label="Time zone (optional)" htmlFor="tz" hint="Leave blank and it's detected from your first city."><Input id="tz" value={t.timezone} onChange={e => set("timezone", e.target.value)} placeholder="e.g. Europe/Lisbon" autoCapitalize="none" /></Field>
          {named.map(d => { const i = dests.indexOf(d); return (
            <details key={i} className="rounded-2xl border border-line bg-surface px-4 py-3" open={Boolean(d.accommodationName || d.accommodationAddress)}>
              <summary className="cursor-pointer font-semibold">Where you're staying in {d.name}</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Hotel or place" htmlFor={`acc-${i}`}><Input id={`acc-${i}`} value={d.accommodationName} onChange={e => setDest(i, { accommodationName: e.target.value })} /></Field>
                <Field label="Neighborhood" htmlFor={`nb-${i}`}><Input id={`nb-${i}`} value={d.neighborhood} onChange={e => setDest(i, { neighborhood: e.target.value })} /></Field>
                <Field label="Address" htmlFor={`addr-${i}`} className="sm:col-span-2"><Input id={`addr-${i}`} value={d.accommodationAddress} onChange={e => setDest(i, { accommodationAddress: e.target.value })} /></Field>
                <Field label="Check-in time" htmlFor={`ci-${i}`}><Input id={`ci-${i}`} type="time" value={d.checkInTime} onChange={e => setDest(i, { checkInTime: e.target.value })} /></Field>
                <Field label="Check-out time" htmlFor={`co-${i}`}><Input id={`co-${i}`} type="time" value={d.checkOutTime} onChange={e => setDest(i, { checkOutTime: e.target.value })} /></Field>
                {t.isRoadTrip && <Field label="Parking notes" htmlFor={`park-${i}`} className="sm:col-span-2"><Input id={`park-${i}`} value={d.parkingNotes} onChange={e => setDest(i, { parkingNotes: e.target.value })} /></Field>}
              </div>
            </details>); })}
        </>}

        {current.id === "places" && <>
          <ListEditor label="Must-see places" items={mustSee} onChange={setMustSee} placeholder="e.g. Jerónimos Monastery" />
          <ListEditor label="Nice to have" items={optional} onChange={setOptional} placeholder="e.g. LX Factory" />
        </>}

        {current.id === "food" && <>
          <Field label="Dietary needs" htmlFor="diet"><Input id="diet" value={t.dietary} onChange={e => set("dietary", e.target.value)} placeholder="e.g. vegetarian, nut allergy" /></Field>
          <Field label="Restaurant style" htmlFor="rest"><Input id="rest" value={t.restaurantPrefs} onChange={e => set("restaurantPrefs", e.target.value)} placeholder="e.g. casual local places, one special dinner" /></Field>
          <Field label="Accessibility needs" htmlFor="acc"><Textarea id="acc" value={t.accessibility} onChange={e => set("accessibility", e.target.value)} placeholder="e.g. avoid long stairs, need step-free access" /></Field>
          <Field label="Anything else?" htmlFor="prefs"><Textarea id="prefs" value={t.preferences} onChange={e => set("preferences", e.target.value)} placeholder="e.g. early risers, no museums on sunny days" /></Field>
        </>}

        {current.id === "ready" && <>
          <Field label="Trip name" htmlFor="name" hint="Filled in for you. Change it if you like.">
            <Input id="name" value={shownName} maxLength={120} onChange={e => { setNameTouched(true); setName(e.target.value); }} />
          </Field>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            <Summary label="Where" value={named.map(d => d.name.trim()).join(" → ")} onEdit={() => go(0)} />
            <Summary label="When" value={dateRangeLabel(t.startDate, t.endDate)} onEdit={() => go(1)} />
            <Summary label="Who" value={peopleLabel(t.adults, t.children)} onEdit={() => go(2)} />
            <Summary label="Style" value={[PACES.find(p => p.id === t.pace)?.label, ...interests].filter(Boolean).join(" · ")} onEdit={() => go(3)} />
            <Summary label="Budget" value={t.budget.trim() ? `${t.budget.trim()} ${t.currency}` : ""} onEdit={() => go(4)} />
            <Summary label="Getting there" value={filled.getting ? [t.departureCity && `From ${t.departureCity}`, t.isRoadTrip && "Road trip", dests.some(d => d.accommodationName) && "Stay added"].filter(Boolean).join(" · ") || "Added" : ""} onEdit={() => go(5)} />
            <Summary label="Must-sees" value={[...mustSee, ...optional].join(", ")} onEdit={() => go(6)} />
            <Summary label="Food & needs" value={[t.dietary, t.restaurantPrefs].filter(Boolean).join(" · ") || (filled.food ? "Added" : "")} onEdit={() => go(7)} />
          </ul>
          <p className="text-sm text-muted">{trial ? `Your free Premium trial opens for this trip. ${trial.durationDays ? `All Premium features are included for ${trial.durationDays} days from activation.` : "All Premium features are included until revoked."} No payment details are needed.` : "Planning is free. Next come a few quick travel questions, then your first days are planned."}</p>
        </>}
      </fieldset>

      {error && <Notice tone="danger" className="mt-5"><span id="wizard-error" role="alert">{error}</span></Notice>}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {step > 0 ? <Button variant="ghost" onClick={() => go(step - 1)} disabled={pending} className="whitespace-nowrap px-3">← Back</Button> : <Link href="/trips" className="px-3 text-sm text-muted hover:text-ink">Cancel</Link>}
          <span className="flex-1" />
          {current.optional && !filled[current.id] && <Button variant="ghost" onClick={() => go(step + 1)} disabled={pending} className="whitespace-nowrap px-3">Skip</Button>}
          <Button type="submit" variant="primary" disabled={pending} className="min-w-32 whitespace-nowrap">
            {isLast ? (pending ? "Creating…" : trial ? "Create trial trip" : "Create trip") : "Next →"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Stepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (v: number) => void }) {
  return <div className="flex min-h-12 items-center justify-between gap-3">
    <span className="font-medium">{label}</span>
    <span className="flex items-center gap-3">
      <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="grid h-11 w-11 place-items-center rounded-full border border-line text-xl disabled:opacity-40">−</button>
      <span aria-live="polite" className="w-6 text-center font-display text-xl font-semibold tabular-nums">{value}</span>
      <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= 50} onClick={() => onChange(Math.min(50, value + 1))} className="grid h-11 w-11 place-items-center rounded-full border border-line text-xl disabled:opacity-40">+</button>
    </span>
  </div>;
}

function Summary({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }): ReactNode {
  return <li className="flex items-center gap-3 px-4 py-3">
    <span className="w-28 shrink-0 text-sm text-muted">{label}</span>
    <span className={cx("min-w-0 flex-1 truncate", !value && "text-muted")}>{value || "Skipped"}</span>
    <button type="button" onClick={onEdit} className="text-sm font-semibold text-accent-ink underline underline-offset-2">Edit</button>
  </li>;
}

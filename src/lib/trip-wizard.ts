// Create a trip, one question per screen. Shared by the website and the app so both ask the same
// questions, in the same order, with the same wording and checks. No imports: the app bundles this file.

export const WIZARD_STEPS = [
  { id: "where", title: "Where are you going?", hint: "Add one city, or several for a multi-city trip.", optional: false },
  { id: "when", title: "When?", hint: "Pick the first and last day of the trip.", optional: false },
  { id: "who", title: "Who's going?", hint: "Count everyone, including yourself. You can add names later.", optional: false },
  { id: "style", title: "Your travel style", hint: "How full should the days be, and what do you enjoy?", optional: true },
  { id: "budget", title: "Budget", hint: "Roughly what the whole group wants to spend. Helps pick places and restaurants.", optional: true },
  { id: "getting", title: "Getting there & staying", hint: "Arrival and departure times help avoid impossible first and last days.", optional: true },
  { id: "places", title: "Must-see places", hint: "The planner never drops a must-see.", optional: true },
  { id: "food", title: "Food & needs", hint: "Only share what you're comfortable with. It's used for this trip only.", optional: true },
  { id: "ready", title: "Ready!", hint: "Check your trip and give it a name.", optional: false },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"];

export type WizardDest = { name: string; country: string; arriveDate: string; departDate: string; accommodationName: string; accommodationAddress: string; neighborhood: string; checkInTime: string; checkOutTime: string; parkingNotes: string };

export const GROUPS = [
  { id: "solo", label: "Solo", adults: 1, children: 0 },
  { id: "couple", label: "Couple", adults: 2, children: 0 },
  { id: "friends", label: "Friends", adults: 4, children: 0 },
  { id: "family", label: "Family", adults: 2, children: 2 },
] as const;

export const PACES = [
  { id: "RELAXED", label: "Relaxed", hint: "A few things a day, lots of free time" },
  { id: "BALANCED", label: "Balanced", hint: "A good mix of plans and breaks" },
  { id: "AMBITIOUS", label: "Busy", hint: "See as much as possible" },
] as const;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const emptyWizardDest = (): WizardDest => ({ name: "", country: "", arriveDate: "", departDate: "", accommodationName: "", accommodationAddress: "", neighborhood: "", checkInTime: "", checkOutTime: "", parkingNotes: "" });

const isoParts = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };

/** Days in a trip, counting both ends (12–18 Dec is 7 days). */
export function tripDays(start: string, end: string) {
  const a = isoParts(start), b = isoParts(end);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86_400_000) + 1;
}

/** "12 – 18 Dec · 7 days", "28 Dec – 3 Jan · 7 days". */
export function dateRangeLabel(start: string, end: string) {
  const a = isoParts(start), b = isoParts(end);
  if (!a) return "";
  if (!b) return `${a.d} ${SHORT[a.m]}`;
  const days = tripDays(start, end);
  const range = start === end ? `${a.d} ${SHORT[a.m]}` : a.m === b.m && a.y === b.y ? `${a.d} – ${b.d} ${SHORT[b.m]}` : `${a.d} ${SHORT[a.m]} – ${b.d} ${SHORT[b.m]}`;
  return `${range} · ${days} ${days === 1 ? "day" : "days"}`;
}

/** A name to start from: "Lisbon in December", "Lisbon & Porto in December", "Lisbon trip". */
export function suggestTripName(dests: { name: string }[], start: string) {
  const names = dests.map(d => d.name.trim()).filter(Boolean);
  if (!names.length) return "";
  const where = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} & more`;
  const when = isoParts(start);
  return (when ? `${where} in ${MONTHS[when.m]}` : `${where} trip`).slice(0, 120);
}

export type WizardCheck = { dests: WizardDest[]; startDate: string; endDate: string; adults: number; name: string };

/** What stops Next on a step, in plain words, or null. */
export function wizardStepError(step: WizardStepId, s: WizardCheck): string | null {
  const named = s.dests.filter(d => d.name.trim());
  if (step === "where") return named.length ? null : "Add where you're going.";
  if (step === "when") {
    if (!s.startDate || !s.endDate) return "Pick the first and last day of your trip.";
    if (s.endDate < s.startDate) return "The last day is before the first day.";
    if (tripDays(s.startDate, s.endDate) > 121) return "Trips can be up to 120 days.";
    if (named.length > 1) {
      for (const d of named) {
        if (!d.arriveDate || !d.departDate) return `Add the days you'll spend in ${d.name.trim()}.`;
        if (d.departDate < d.arriveDate) return `In ${d.name.trim()}, the leave day is before the arrive day.`;
        if (d.arriveDate < s.startDate || d.departDate > s.endDate) return `The days in ${d.name.trim()} must be within the trip dates.`;
      }
    }
    return null;
  }
  if (step === "who") return s.adults >= 1 ? null : "At least one adult is going.";
  if (step === "ready") return s.name.trim() ? null : "Give your trip a name.";
  return null;
}

/** The first step with a problem, so Create trip can jump straight to it. */
export function firstWizardProblem(s: WizardCheck): { index: number; error: string } | null {
  for (let i = 0; i < WIZARD_STEPS.length; i++) {
    const error = wizardStepError(WIZARD_STEPS[i].id, s);
    if (error) return { index: i, error };
  }
  return null;
}

/**
 * For a multi-city trip, splits the trip days across the cities in order (a moving day is both the
 * last day in one city and the first in the next), so the stay dates start filled in sensibly.
 */
export function splitStays(dests: WizardDest[], start: string, end: string): WizardDest[] {
  const named = dests.filter(d => d.name.trim());
  const days = tripDays(start, end);
  if (named.length < 2 || days < 1) return dests;
  const a = isoParts(start)!;
  const at = (offset: number) => new Date(Date.UTC(a.y, a.m, a.d + offset)).toISOString().slice(0, 10);
  const per = (days - 1) / named.length;
  let i = 0;
  return dests.map(d => {
    if (!d.name.trim() || (d.arriveDate && d.departDate)) { if (d.name.trim()) i++; return d; }
    const from = Math.round(per * i), to = i === named.length - 1 ? days - 1 : Math.round(per * (i + 1));
    i++;
    return { ...d, arriveDate: at(from), departDate: at(to) };
  });
}

export function peopleLabel(adults: number, children: number) {
  const a = `${adults} ${adults === 1 ? "adult" : "adults"}`;
  return children ? `${a}, ${children} ${children === 1 ? "child" : "children"}` : a;
}

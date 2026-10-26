import { readMealOptions } from "@/lib/meal-options";
import { isDateStr, isTimeStr, toMinutes } from "@/lib/dates";
import { safeUrl } from "@/lib/maps";
import { findOverlaps, type SchedStop } from "@/server/itinerary/schedule";
import type { Anchor } from "./context";
import type { PlanDay, PlanStop, Proposal } from "./schema";

export type Issue = { date: string | null; severity: "conflict" | "warning" | "info"; message: string };

export type CheckInput = {
  dates: string[];
  anchors: Anchor[];
  mustSee: string[];
  arrivalAt: string | null; // YYYY-MM-DDTHH:MM
  departureAt: string | null;
};

const BOOKED_CLAIM = /\b(already (booked|reserved|paid)|is booked|are booked|you('ve| have) booked|booking (is )?confirmed|confirmed reservation|reservation confirmed)\b/i;

function tokens(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "museum", "de", "del", "la", "le"].includes(w));
}

export function mentions(stop: Pick<PlanStop, "title" | "locationName">, place: string) {
  const want = tokens(place);
  if (!want.length) return false;
  const have = new Set(tokens(`${stop.title} ${stop.locationName ?? ""}`));
  const hits = want.filter((w) => have.has(w)).length;
  return hits / want.length >= 0.6;
}

function sanitizeStop(s: PlanStop, date: string, issues: Issue[]): PlanStop | null {
  if (!s.title?.trim()) return null;
  const out: PlanStop = {
    ...s,
    title: s.title.trim().slice(0, 160),
    reason: s.reason.slice(0, 600),
    officialUrl: safeUrl(s.officialUrl),
    sourceUrls: s.sourceUrls.map((u) => safeUrl(u)).filter((u): u is string => Boolean(u)).slice(0, 5),
    durationMin: Math.max(0, Math.min(16 * 60, Math.round(s.durationMin || 0))),
    travelToNextMin: s.travelToNextMin === null ? null : Math.max(0, Math.min(12 * 60, Math.round(s.travelToNextMin))),
    estCost: s.estCost === null || !Number.isFinite(s.estCost) || s.estCost < 0 ? null : s.estCost,
    lat: s.lat !== null && Math.abs(s.lat) <= 90 ? s.lat : null,
    lng: s.lng !== null && Math.abs(s.lng) <= 180 ? s.lng : null,
  };
  if (!isTimeStr(out.startTime)) {
    issues.push({ date, severity: "warning", message: `“${out.title}” had an invalid time (${String(s.startTime).slice(0, 10)}); it was left untimed.` });
    out.startTime = "";
  }
  for (const k of ["bookingNote", "reason", "hoursNote", "travelNote"] as const) {
    const v = out[k];
    if (v && BOOKED_CLAIM.test(v)) {
      out[k] = v.replace(BOOKED_CLAIM, "(booking status unknown — check the booking tracker)");
      issues.push({ date, severity: "info", message: `Removed a claim that “${out.title}” is booked. Only bookings you record are shown as booked.` });
    }
  }
  return out;
}

/**
 * Validates and sanitizes an AI proposal against the trip's real constraints. Returns the cleaned proposal and
 * a list of issues to show the travelers before anything is saved.
 */
export function checkProposal(p: Proposal, input: CheckInput): { proposal: Proposal; issues: Issue[] } {
  const issues: Issue[] = [];
  const wanted = new Set(input.dates);
  const seen = new Set<string>();
  const days: PlanDay[] = [];

  for (const d of p.days) {
    if (!isDateStr(d.date) || !wanted.has(d.date)) {
      issues.push({ date: null, severity: "warning", message: `Ignored a day for ${String(d.date).slice(0, 12)}, which is not one of the requested dates.` });
      continue;
    }
    if (seen.has(d.date)) {
      issues.push({ date: d.date, severity: "warning", message: `Ignored a duplicate entry for ${d.date}.` });
      continue;
    }
    seen.add(d.date);
    const stops = d.stops.map((s) => sanitizeStop(s, d.date, issues)).filter((s): s is PlanStop => Boolean(s));
    const planB = d.planB.map((s) => sanitizeStop(s, d.date, issues)).filter((s): s is PlanStop => Boolean(s));
    stops.sort((a, b) => (a.startTime || "99").localeCompare(b.startTime || "99"));
    const meals = readMealOptions(d.meals);
    if (d.meals) for (const meal of ["breakfast", "lunch", "dinner"] as const) {
      if (meals[meal].length < 2) issues.push({ date: d.date, severity: "info", message: `Only ${meals[meal].length} sourced ${meal} option(s) were found. Check local options before you go.` });
    }
    days.push({ ...d, meals, stops, planB, title: d.title.slice(0, 120), area: d.area.slice(0, 120) });
  }
  for (const date of input.dates) if (!seen.has(date)) issues.push({ date, severity: "conflict", message: `The AI did not return a plan for ${date}. That day was left unchanged.` });
  days.sort((a, b) => a.date.localeCompare(b.date));

  for (const d of days) {
    const anchors = input.anchors.filter((a) => a.date === d.date);
    const sched: SchedStop[] = [
      ...d.stops.filter((s) => s.startTime).map((s, i) => ({ id: `ai${i}`, title: s.title, startTime: s.startTime, durationMin: s.durationMin, travelToNextMin: s.travelToNextMin, anchored: false, isMeal: s.isMeal, skipped: false, estCostMinor: null })),
      ...anchors.map((a) => ({ id: a.ref, title: a.title, startTime: a.startTime, durationMin: a.durationMin, travelToNextMin: 0, anchored: true, isMeal: false, skipped: false, estCostMinor: null })),
    ];
    for (const c of findOverlaps(sched)) issues.push({ date: d.date, severity: c.severity, message: c.severity === "conflict" ? `${c.message} Fixed items are never moved — adjust the suggested stop.` : c.message });

    if (input.arrivalAt?.startsWith(d.date)) {
      const arr = toMinutes(input.arrivalAt.slice(11, 16));
      for (const s of d.stops) if (s.startTime && toMinutes(s.startTime) < arr + 45) issues.push({ date: d.date, severity: "conflict", message: `“${s.title}” at ${s.startTime} is too close to your arrival at ${input.arrivalAt.slice(11, 16)}.` });
    }
    if (input.departureAt?.startsWith(d.date)) {
      const dep = toMinutes(input.departureAt.slice(11, 16));
      for (const s of d.stops) if (s.startTime && toMinutes(s.startTime) + s.durationMin > dep - 90) issues.push({ date: d.date, severity: "conflict", message: `“${s.title}” ends too close to your departure at ${input.departureAt.slice(11, 16)}.` });
    }
    const sightseeing = d.stops.filter((s) => !s.isMeal && !s.isFreeTime && s.category !== "transport" && s.category !== "rest").reduce((a, s) => a + s.durationMin, 0);
    if ((d.driveMinutes ?? 0) >= 240 && sightseeing > 180) issues.push({ date: d.date, severity: "warning", message: `About ${Math.round((d.driveMinutes ?? 0) / 60)} h of driving plus ${Math.round(sightseeing / 60)} h of sightseeing — consider trimming this day.` });
    const busy = d.stops.reduce((a, s) => a + s.durationMin + (s.travelToNextMin ?? 0), 0);
    if (busy > 13 * 60) issues.push({ date: d.date, severity: "warning", message: `This day is scheduled for about ${Math.round(busy / 60)} hours — it may be too full.` });
    if (!d.stops.some((s) => s.isMeal) && !anchors.length && d.stops.length >= 3) issues.push({ date: d.date, severity: "info", message: "No meal break was suggested for this day." });
  }

  // Must-sees: placed, explicitly explained, or flagged — never silently dropped.
  const allStops = days.flatMap((d) => d.stops);
  for (const m of input.mustSee) {
    const placed = allStops.some((s) => mentions(s, m)) || input.anchors.some((a) => mentions({ title: a.title, locationName: null }, m));
    const explained = p.unplacedMustSees.some((u) => mentions({ title: u.name, locationName: null }, m));
    if (!placed && !explained) issues.push({ date: null, severity: "conflict", message: `Must-see “${m}” is not in this plan and the AI did not explain why. Add it manually or regenerate.` });
  }
  return { proposal: { ...p, days }, issues };
}

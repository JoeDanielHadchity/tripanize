import { createHash } from "node:crypto";
import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { stopInclude, effectiveStop, toSched } from "@/server/itinerary/service";
import { findOverlaps } from "@/server/itinerary/schedule";
import { checkProposal } from "@/server/planner/checks";
import { planStopData } from "@/server/planner/apply";
import { currencyDigits } from "@/lib/money";
import { formatDate, isTimeStr, toMinutes } from "@/lib/dates";
import type { AssistantPreview, AssistantStopPreview } from "@/lib/trip-assistant";
import type { AssistantEdit } from "./schema";
import type { PlanStop } from "@/server/planner/schema";

export async function loadAssistantState(db: Pick<Tx, "trip" | "itineraryDay" | "stop">, tripId: string) {
  const [trip, days, stops] = await Promise.all([
    db.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" } }, places: true } }),
    db.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } }),
    db.stop.findMany({ where: { tripId }, include: stopInclude, orderBy: [{ position: "asc" }, { id: "asc" }] }),
  ]);
  return { trip, days, stops };
}
export type AssistantState = Awaited<ReturnType<typeof loadAssistantState>>;
export function assistantStateHash(state: AssistantState) {
  return createHash("sha256").update(JSON.stringify({ trip: [state.trip.id, state.trip.revision, state.trip.updatedAt], days: state.days.map(d => [d.id, d.version, d.updatedAt]), stops: state.stops.map(s => [s.id, s.version, s.updatedAt, s.booking?.version]) })).digest("hex");
}
const protectedStop = (s: AssistantState["stops"][number]) => s.isFixed || Boolean(s.bookingId) || Boolean(s.eventId) || s.origin === "COMMITMENT";
const schedule = (s: AssistantState["stops"][number]) => ({ ...toSched(s), anchored: protectedStop(s) });
const fail = (message: string): never => { throw new AppError("VALIDATION", message); };
const dayFields = ["title", "area", "notes", "questions", "activePlan", "planBNote", "estCostMinor"] as const;
export function dayPatch(day: AssistantState["days"][number]) { return Object.fromEntries(dayFields.map(k => [k, day[k]])); }
export function stopPatch(s: AssistantState["stops"][number]) {
  const { id: _id, tripId: _tripId, booking: _booking, event: _event, createdAt: _created, updatedAt: _updated, version: _version, ...data } = s;
  return data;
}

/** Pure simulation used for both review and the final atomic write. No model output writes directly. */
export function previewAssistantEdits(state: AssistantState, edits: AssistantEdit[]) {
  if (edits.length > 30) fail("Please split this request into smaller changes (up to 30 at a time).");
  const days = state.days.map(d => ({ ...d }));
  const stops = state.stops.map(s => ({ ...s }));
  const touched = new Set<string>();
  const reroute = new Set<string>();
  const changes: string[] = [], warnings: string[] = [];
  const dayFor = (date: string) => days.find(d => d.date === date) ?? fail(`There is no itinerary day on ${date.slice(0, 10)}. Choose a date inside this trip.`);
  const stopFor = (id: string) => {
    const s = stops.find(s => s.id === id) ?? fail("An activity in this proposal no longer exists in this trip. Please ask again.");
    if (protectedStop(s)) fail(`“${effectiveStop(s).title}” is a booking, fixed commitment or chosen event. Change it directly in the itinerary or booking tracker; the assistant keeps it protected.`);
    return s;
  };
  const touch = (id: string | null, route = false) => { if (id) { touched.add(id); if (route) reroute.add(id); } };
  const checkTime = (time: string | null) => { if (time !== null && !isTimeStr(time)) fail("A proposed time is invalid. Please ask for a new draft."); };
  function cleanStop(stop: PlanStop, date: string) {
    if (!stop.title.trim() || !isTimeStr(stop.startTime) || stop.durationMin < 1 || stop.durationMin > 960 || (stop.estCost !== null && (!Number.isFinite(stop.estCost) || stop.estCost < 0 || stop.estCost * 10 ** currencyDigits(state.trip.currency) > 2_147_483_647))) fail("A suggested activity has an invalid title, time, duration or cost. Please ask for a new draft.");
    const checked = checkProposal({ summary: "", unplacedMustSees: [], generalNotes: [], days: [{ date, area: "", title: "", isTravelDay: false, driveMinutes: null, stops: [stop], planB: [], planBNote: null, notes: [], questions: [], estCost: null }] }, { dates: [date], anchors: [], mustSee: [], arrivalAt: null, departureAt: null });
    warnings.push(...checked.issues.map(i => i.message));
    return checked.proposal.days[0].stops[0];
  }
  for (const [index, edit] of edits.entries()) {
    if (edit.type === "swap_days") {
      const a = dayFor(edit.date), b = dayFor(edit.otherDate);
      if (a.id === b.id) fail("Choose two different days to swap.");
      if (a.destinationId !== b.destinationId || a.isTravelDay || b.isTravelDay || [a.date, b.date].some(d => state.trip.arrivalAt?.startsWith(d) || state.trip.departureAt?.startsWith(d))) fail("Whole days can only be swapped within the same destination, without changing travel, arrival or departure days. Ask to move individual activities instead.");
      if (stops.some(s => (s.dayId === a.id || s.dayId === b.id) && protectedStop(s))) fail("One of these days contains a booking, fixed commitment or chosen event. Ask to move its flexible activities instead; those commitments must stay on their dates.");
      const aData = dayPatch(a), bData = dayPatch(b);
      Object.assign(a, bData); Object.assign(b, aData);
      for (const s of stops) { if (s.dayId === a.id) s.dayId = b.id; else if (s.dayId === b.id) s.dayId = a.id; }
      touch(a.id); touch(b.id);
      changes.push(`Swap the plans for ${formatDate(a.date)} and ${formatDate(b.date)}, including Plan A, Plan B and day notes.`);
      warnings.push("Opening hours and ticket availability may differ on the new dates. Check them before travelling.");
    } else if (edit.type === "edit_day") {
      const d = dayFor(edit.date);
      if (edit.title === null && edit.notes === null && edit.activePlan === null) fail("This day edit has no changes.");
      if (edit.title !== null) d.title = edit.title.slice(0, 120) || null;
      if (edit.notes !== null) d.notes = edit.notes.slice(0, 2000) || null;
      if (edit.activePlan !== null) d.activePlan = edit.activePlan;
      touch(d.id); changes.push(`Update ${formatDate(d.date)}${edit.activePlan ? ` to Plan ${edit.activePlan}` : " title or notes"}.`);
    } else if (edit.type === "add_stop") {
      const d = dayFor(edit.date);
      const clean = cleanStop(edit.stop, d.date);
      const data = planStopData(clean, state.trip.currency, stops.filter(s => s.dayId === d.id && s.plan === edit.plan).length, edit.plan);
      stops.push({ ...state.stops[0], ...data, id: `assistant-new-${index}`, tripId: state.trip.id, dayId: d.id, bookingId: null, eventId: null, booking: null, event: null, notes: null, isFixed: false, version: 1, createdById: null, createdAt: new Date(0), updatedAt: new Date(0) } as AssistantState["stops"][number]);
      touch(d.id, true); changes.push(`Add “${clean.title}” on ${formatDate(d.date)} at ${clean.startTime} (Plan ${edit.plan}).`);
    } else {
      const s = stopFor(edit.stopId), originalDay = s.dayId;
      if (edit.type === "remove_stop") {
        stops.splice(stops.indexOf(s), 1); touch(originalDay, true);
        changes.push(`Remove “${s.title}”${originalDay ? ` from ${formatDate(days.find(d => d.id === originalDay)!.date)}` : " from ideas"}.`);
      } else if (edit.type === "move_stop") {
        checkTime(edit.startTime);
        const d = edit.date ? dayFor(edit.date) : null;
        s.dayId = d?.id ?? null; s.plan = edit.plan;
        if (edit.startTime !== null) s.startTime = edit.startTime;
        s.position = stops.filter(x => x.id !== s.id && x.dayId === s.dayId && x.plan === s.plan).length;
        touch(originalDay, true); touch(s.dayId, true);
        changes.push(`Move “${s.title}” to ${d ? `${formatDate(d.date)}${s.startTime ? ` at ${s.startTime}` : ""} (Plan ${s.plan})` : "unscheduled ideas"}.`);
        warnings.push("Check opening hours and travel time on the new date.");
      } else if (edit.type === "edit_stop") {
        checkTime(edit.startTime);
        if (edit.startTime === null && edit.durationMin === null && edit.notes === null) fail("This activity edit has no changes.");
        if (edit.durationMin !== null && (edit.durationMin < 1 || edit.durationMin > 960)) fail("Activity durations must be between 1 and 960 minutes.");
        if (edit.startTime !== null) s.startTime = edit.startTime;
        if (edit.durationMin !== null) s.durationMin = edit.durationMin;
        if (edit.notes !== null) s.notes = edit.notes.slice(0, 2000) || null;
        touch(s.dayId);
        changes.push(`Update “${s.title}”${edit.startTime !== null ? ` to ${edit.startTime}` : ""}${edit.durationMin !== null ? ` · ${edit.durationMin} minutes` : ""}${edit.notes !== null ? " · notes updated" : ""}.`);
      } else if (edit.type === "replace_stop") {
        const clean = cleanStop(edit.stop, days.find(d => d.id === s.dayId)?.date ?? state.trip.startDate ?? "2000-01-01");
        const before = s.title;
        Object.assign(s, planStopData(clean, state.trip.currency, s.position, s.plan as "A" | "B"));
        s.notes = null; touch(s.dayId, true);
        changes.push(`Replace “${before}” with “${s.title}”${s.startTime ? ` at ${s.startTime}` : ""}.`);
      }
    }
  }
  if (reroute.size) warnings.push("Travel times between activities need checking after these route changes.");
  for (const id of reroute) for (const s of stops.filter(s => s.dayId === id && !protectedStop(s))) { s.travelToNextMin = null; s.travelMode = null; s.travelNote = null; }
  const conflicts: string[] = [];
  for (const id of touched) for (const plan of ["A", "B"]) {
    const planned = stops.filter(s => s.dayId === id && s.plan === plan).sort((a, b) => (effectiveStop(a).startTime ?? "99:99").localeCompare(effectiveStop(b).startTime ?? "99:99") || a.position - b.position);
    for (const [position, s] of planned.entries()) s.position = position;
    const old = findOverlaps(state.stops.filter(s => s.dayId === id && s.plan === plan).map(schedule)).map(c => c.message);
    for (const issue of findOverlaps(planned.map(schedule))) {
      if (old.includes(issue.message)) continue;
      (issue.severity === "conflict" ? conflicts : warnings).push(issue.message);
    }
    const date = days.find(d => d.id === id)!.date;
    for (const s of planned) {
      if (!s.startTime || s.status === "SKIPPED" || protectedStop(s)) continue;
      const before = state.stops.find(x => x.id === s.id);
      if (before?.dayId === s.dayId && before.startTime === s.startTime && before.durationMin === s.durationMin) continue;
      const start = toMinutes(s.startTime), end = start + (s.durationMin ?? 60);
      for (const anchor of planned.filter(x => protectedStop(x) && x.startTime && x.status !== "SKIPPED")) {
        const fixed = effectiveStop(anchor);
        const fixedStart = toMinutes(fixed.startTime!);
        if (start < fixedStart + (fixed.durationMin ?? 60) && fixedStart < end) conflicts.push(`“${s.title}” overlaps protected “${fixed.title}” at ${fixed.startTime}.`);
      }
      if (end > 1440) conflicts.push(`“${s.title}” would run past midnight.`);
      if (state.trip.arrivalAt?.startsWith(date) && start < toMinutes(state.trip.arrivalAt.slice(11, 16)) + 45) conflicts.push(`“${s.title}” is too close to arrival; leave time for transfers.`);
      if (state.trip.departureAt?.startsWith(date) && end > toMinutes(state.trip.departureAt.slice(11, 16)) - 90) conflicts.push(`“${s.title}” finishes too close to departure; leave time for transfers.`);
    }
  }
  const previewStops = (all: AssistantState["stops"], id: string): AssistantStopPreview[] => all.filter(s => s.dayId === id).sort((a, b) => a.plan.localeCompare(b.plan) || (effectiveStop(a).startTime ?? "99:99").localeCompare(effectiveStop(b).startTime ?? "99:99") || a.position - b.position).map(s => ({ title: effectiveStop(s).title, time: effectiveStop(s).startTime, duration: effectiveStop(s).durationMin, plan: s.plan, protected: protectedStop(s) }));
  const preview: AssistantPreview = {
    changes, warnings: [...new Set(warnings)], conflicts: [...new Set(conflicts)],
    days: days.filter(d => touched.has(d.id)).map(d => ({ date: d.date, beforeTitle: state.days.find(x => x.id === d.id)!.title, afterTitle: d.title, before: previewStops(state.stops, d.id), after: previewStops(stops, d.id) })),
  };
  return { days, stops, touched, preview };
}

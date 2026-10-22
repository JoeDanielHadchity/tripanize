import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { AppError, conflictError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { requirePremiumAccess } from "@/server/plans/access";
import { recordChange } from "@/server/audit";
import { isTimeStr } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { safeUrl } from "@/lib/maps";
import { computeImpact, recalcDay, type Impact, type SchedStop } from "./schedule";
import type { Prisma } from "@/generated/prisma/client";
import { formatZodError } from "@/server/trips/schemas";

export const stopInclude = { booking: true, event: { select: { id: true, title: true, officialUrl: true } } } satisfies Prisma.StopInclude;
export type StopWithRefs = Omit<Prisma.StopGetPayload<{ include: typeof stopInclude }>, "sourceUrls"> & { sourceUrls: string[] };

/** A booking projection takes its schedule from the canonical booking record. */
export function effectiveStop(s: StopWithRefs) {
  if (!s.booking) return s;
  return {
    ...s,
    title: s.booking.title,
    startTime: s.booking.startTime,
    durationMin: s.booking.durationMin ?? s.durationMin,
    address: s.booking.address ?? s.address,
    officialUrl: s.booking.bookingUrl ?? s.officialUrl,
    estCostMinor: s.booking.finalCostMinor ?? s.booking.estCostMinor,
    currency: s.booking.currency,
    status: (s.booking.status === "BOOKED" || s.booking.status === "PAID" ? "CONFIRMED" : "PLANNED") as StopWithRefs["status"],
  };
}

export function isAnchored(s: StopWithRefs) {
  return s.isFixed || (!!s.booking && (s.booking.status === "BOOKED" || s.booking.status === "PAID" || s.booking.status === "REQUESTED"));
}

export function toSched(s: StopWithRefs): SchedStop {
  const e = effectiveStop(s);
  return {
    id: s.id,
    title: e.title,
    startTime: e.startTime,
    durationMin: e.durationMin,
    travelToNextMin: s.travelToNextMin,
    anchored: isAnchored(s),
    isMeal: s.isMeal,
    skipped: s.status === "SKIPPED",
    estCostMinor: e.estCostMinor,
    bookingStatus: s.booking?.status ?? null,
  };
}

async function dayStops(tx: Tx | typeof prisma, dayId: string, plan: string) {
  return tx.stop.findMany({ where: { dayId, plan }, include: stopInclude, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
}

/** Persist recalculated times for flexible stops and new positions. */
async function persistOrder(tx: Tx, ordered: StopWithRefs[], recalced: SchedStop[]) {
  for (const [i, s] of ordered.entries()) {
    const r = recalced.find((x) => x.id === s.id)!;
    const timeChanged = !s.booking && !s.isFixed && r.startTime !== s.startTime;
    if (s.position !== i || timeChanged) {
      await tx.stop.update({ where: { id: s.id }, data: { position: i, ...(timeChanged ? { startTime: r.startTime } : {}), version: { increment: 1 } } });
    }
  }
}

function simulate(before: StopWithRefs[], after: StopWithRefs[], mode: "sequence" | "push", overrides: Record<string, Partial<SchedStop>> = {}) {
  const b = before.map(toSched);
  const a = after.map((s) => ({ ...toSched(s), ...(overrides[s.id] ?? {}) }));
  const r = recalcDay(a, mode);
  return { recalced: r.stops, impact: computeImpact(b, r.stops, r.conflicts) };
}

// ───────────── Stop input ─────────────

const stopFields = z.object({
  title: z.string().trim().min(1, "Give the stop a title").max(160),
  category: z.string().trim().max(40).default("sight"),
  locationName: z.string().trim().max(160).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  reason: z.string().trim().max(600).optional().nullable(),
  startTime: z.string().optional().nullable().refine((v) => !v || isTimeStr(v), "Use HH:MM for the time"),
  durationMin: z.coerce.number().int().min(0).max(24 * 60).optional().nullable(),
  travelToNextMin: z.coerce.number().int().min(0).max(24 * 60).optional().nullable(),
  travelMode: z.string().max(20).optional().nullable(),
  officialUrl: z.string().max(500).optional().nullable(),
  estCost: z.string().max(20).optional().nullable(),
  bookingRequired: z.boolean().optional(),
  bookingNote: z.string().max(300).optional().nullable(),
  hoursNote: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isMeal: z.boolean().optional(),
  isFreeTime: z.boolean().optional(),
  indoor: z.boolean().optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
});
export type StopInput = z.input<typeof stopFields>;

function parseStop(input: Partial<StopInput>, currency: string, partial = false) {
  const r = (partial ? stopFields.partial() : stopFields).safeParse(input);
  if (!r.success) throw new AppError("VALIDATION", formatZodError(r.error));
  const d = r.data;
  const out: Prisma.StopUncheckedUpdateInput = {};
  for (const k of ["title", "category", "locationName", "address", "reason", "durationMin", "travelToNextMin", "travelMode", "bookingRequired", "bookingNote", "hoursNote", "notes", "isMeal", "isFreeTime", "indoor", "lat", "lng"] as const) {
    if (d[k] !== undefined) (out as Record<string, unknown>)[k] = d[k] === "" ? null : d[k];
  }
  if (d.startTime !== undefined) out.startTime = d.startTime || null;
  if (d.officialUrl !== undefined) {
    if (d.officialUrl && !safeUrl(d.officialUrl)) throw new AppError("VALIDATION", "Links must start with https:// or http://");
    out.officialUrl = safeUrl(d.officialUrl);
  }
  if (d.estCost !== undefined) {
    const m = d.estCost ? parseMoney(d.estCost, currency) : null;
    if (d.estCost && m === null) throw new AppError("VALIDATION", "Cost must be a number");
    out.estCostMinor = m;
    out.currency = currency;
  }
  return out;
}

// ───────────── Queries ─────────────

export async function getItinerary(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId, "view");
  const [days, ideas] = await Promise.all([
    prisma.itineraryDay.findMany({
      where: { tripId },
      orderBy: { date: "asc" },
      include: { destination: true, stops: { include: stopInclude, orderBy: [{ position: "asc" }, { createdAt: "asc" }] } },
    }),
    prisma.stop.findMany({ where: { tripId, dayId: null }, include: stopInclude, orderBy: { createdAt: "desc" } }),
  ]);
  return { access, days, ideas };
}

// ───────────── Mutations ─────────────

export async function addStop(userId: string, tripId: string, args: { dayId: string | null; plan?: "A" | "B"; input: StopInput }) {
  await requireTrip(tripId, userId, "edit");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const data = parseStop(args.input, trip.currency);
  const plan = args.plan ?? "A";
  return prisma.$transaction(async (tx) => {
    if (args.dayId) {
      const day = await tx.itineraryDay.findFirst({ where: { id: args.dayId, tripId } });
      if (!day) throw new AppError("NOT_FOUND", "Day not found.");
    }
    let position = 0;
    if (args.dayId) {
      // Timed stops are inserted chronologically; untimed ones go to the end.
      const existing = await dayStops(tx, args.dayId, plan);
      position = existing.length;
      const t = data.startTime as string | null | undefined;
      if (t) {
        const idx = existing.findIndex((s) => {
          const st = effectiveStop(s).startTime;
          return st !== null && st > t;
        });
        if (idx >= 0) {
          position = idx;
          for (const s of existing.slice(idx)) await tx.stop.update({ where: { id: s.id }, data: { position: s.position + 1 } });
        }
      }
    }
    const stop = await tx.stop.create({
      data: { ...(data as Prisma.StopUncheckedCreateInput), title: String(data.title), tripId, dayId: args.dayId, plan, position, origin: "MANUAL", status: "PLANNED", createdById: userId },
    });
    await recordChange(tx, { tripId, actorId: userId, entity: "stop", entityId: stop.id, action: "create", after: { title: stop.title, dayId: stop.dayId } });
    return stop;
  });
}

async function loadStop(tripId: string, stopId: string) {
  const stop = await prisma.stop.findFirst({ where: { id: stopId, tripId }, include: stopInclude });
  if (!stop) throw new AppError("NOT_FOUND", "That stop no longer exists. It may have been removed by another traveler.");
  return stop;
}

function requireConfirmation(stop: StopWithRefs, confirm: boolean | undefined, what: string) {
  if (confirm) return;
  if (stop.isFixed) {
    throw new AppError("CONFLICT", `“${stop.title}” is a fixed commitment. ${what} Confirm to continue.`, { needsConfirmation: true });
  }
  if (stop.booking && (stop.booking.status === "BOOKED" || stop.booking.status === "PAID")) {
    throw new AppError("CONFLICT", `“${stop.booking.title}” is a confirmed booking (${stop.booking.status.toLowerCase()}). Changing it here only updates your plan — it does not change the reservation with the provider. ${what} Confirm to continue.`, { needsConfirmation: true });
  }
}

/**
 * Edits a stop. Timing changes on fixed commitments or confirmed bookings require explicit confirmation.
 * With dryRun the change is simulated and only the impact is returned.
 */
export async function updateStop(
  userId: string,
  tripId: string,
  stopId: string,
  input: Partial<StopInput>,
  opts: { version: number; confirm?: boolean; dryRun?: boolean },
): Promise<{ impact: Impact | null }> {
  await requireTrip(tripId, userId, "edit");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const stop = await loadStop(tripId, stopId);
  if (stop.version !== opts.version) throw conflictError(`“${stop.title}”`);
  const data = parseStop(input, trip.currency, true);
  const timingChange = (data.startTime !== undefined && data.startTime !== effectiveStop(stop).startTime) || (data.durationMin !== undefined && data.durationMin !== effectiveStop(stop).durationMin);
  if (timingChange && !opts.dryRun) requireConfirmation(stop, opts.confirm, "Its time will change.");

  let impact: Impact | null = null;
  if (stop.dayId) {
    const before = await dayStops(prisma, stop.dayId, stop.plan);
    const sim = simulate(before, before, "push", {
      [stop.id]: {
        ...(data.startTime !== undefined ? { startTime: data.startTime as string | null } : {}),
        ...(data.durationMin !== undefined ? { durationMin: data.durationMin as number | null } : {}),
        ...(data.travelToNextMin !== undefined ? { travelToNextMin: data.travelToNextMin as number | null } : {}),
        ...(data.estCostMinor !== undefined ? { estCostMinor: data.estCostMinor as number | null } : {}),
        ...(timingChange && (stop.isFixed || stop.booking) ? { anchored: true } : {}),
      },
    });
    impact = sim.impact;
    if (opts.dryRun) return { impact };
    await prisma.$transaction(async (tx) => {
      await writeStopUpdate(tx, stop, data, opts.version);
      const fresh = await dayStops(tx, stop.dayId!, stop.plan);
      const r = recalcDay(fresh.map(toSched), "push");
      await persistOrder(tx, fresh, r.stops);
      await recordChange(tx, { tripId, actorId: userId, entity: "stop", entityId: stop.id, action: "update", before: pick(stop), after: data });
    });
  } else {
    if (opts.dryRun) return { impact: null };
    await prisma.$transaction(async (tx) => {
      await writeStopUpdate(tx, stop, data, opts.version);
      await recordChange(tx, { tripId, actorId: userId, entity: "stop", entityId: stop.id, action: "update", before: pick(stop), after: data });
    });
  }
  return { impact };
}

function pick(s: StopWithRefs) {
  return { title: s.title, startTime: s.startTime, durationMin: s.durationMin, dayId: s.dayId, status: s.status };
}

async function writeStopUpdate(tx: Tx, stop: StopWithRefs, data: Prisma.StopUncheckedUpdateInput, version: number) {
  if (stop.booking) {
    // Booking-linked: schedule and title live on the canonical booking.
    const bookingPatch: Prisma.BookingUpdateInput = {};
    if (data.startTime !== undefined) bookingPatch.startTime = data.startTime as string | null;
    if (data.durationMin !== undefined) bookingPatch.durationMin = data.durationMin as number | null;
    if (data.title !== undefined) bookingPatch.title = data.title as string;
    if (data.address !== undefined) bookingPatch.address = data.address as string | null;
    if (Object.keys(bookingPatch).length) await tx.booking.update({ where: { id: stop.booking.id }, data: { ...bookingPatch, version: { increment: 1 } } });
    const { startTime: _s, durationMin: _d, title: _t, address: _a, ...rest } = data;
    const res = await tx.stop.updateMany({ where: { id: stop.id, version }, data: { ...(rest as Prisma.StopUpdateManyMutationInput), version: { increment: 1 } } });
    if (res.count === 0) throw conflictError(`“${stop.title}”`);
    return;
  }
  const res = await tx.stop.updateMany({ where: { id: stop.id, version }, data: { ...(data as Prisma.StopUpdateManyMutationInput), version: { increment: 1 } } });
  if (res.count === 0) throw conflictError(`“${stop.title}”`);
}

export async function setStopStatus(userId: string, tripId: string, stopId: string, status: "SUGGESTED" | "PLANNED" | "SKIPPED", version: number) {
  await requireTrip(tripId, userId, "edit");
  const stop = await loadStop(tripId, stopId);
  if (stop.booking) throw new AppError("VALIDATION", "This stop comes from a booking. Change its status in the booking tracker so every view stays in sync.");
  if (stop.isFixed && status === "SKIPPED") throw new AppError("VALIDATION", "Fixed commitments can't be skipped. Edit or remove the commitment instead.");
  await prisma.$transaction(async (tx) => {
    const res = await tx.stop.updateMany({ where: { id: stopId, version }, data: { status, version: { increment: 1 } } });
    if (res.count === 0) throw conflictError(`“${stop.title}”`);
    await recordChange(tx, { tripId, actorId: userId, entity: "stop", entityId: stopId, action: status === "SKIPPED" ? "skip" : "status", after: { status } });
  });
}

export async function deleteStop(userId: string, tripId: string, stopId: string, opts: { confirm?: boolean } = {}) {
  await requireTrip(tripId, userId, "edit");
  const stop = await loadStop(tripId, stopId);
  if (stop.booking) throw new AppError("VALIDATION", "This stop shows a booking. Remove its date or cancel it in the booking tracker instead.");
  requireConfirmation(stop, opts.confirm, "It will be removed from the plan.");
  await prisma.$transaction(async (tx) => {
    await tx.stop.delete({ where: { id: stopId } });
    if (stop.eventId) await tx.tripEvent.update({ where: { id: stop.eventId }, data: { status: "SAVED" } });
    await recordChange(tx, { tripId, actorId: userId, entity: "stop", entityId: stopId, action: "delete", before: pick(stop) });
  });
}

/** Reorders the stops of one day/plan. With dryRun, returns the impact only. */
export async function reorderStops(userId: string, tripId: string, dayId: string, plan: string, orderedIds: string[], opts: { dryRun?: boolean } = {}) {
  await requireTrip(tripId, userId, "edit");
  const day = await prisma.itineraryDay.findFirst({ where: { id: dayId, tripId } });
  if (!day) throw new AppError("NOT_FOUND", "Day not found.");
  const before = await dayStops(prisma, dayId, plan);
  if (orderedIds.length !== before.length || !before.every((s) => orderedIds.includes(s.id))) {
    throw new AppError("CONFLICT", "This day changed while you were reordering (another traveler may have edited it). Reload and try again.");
  }
  const after = orderedIds.map((id) => before.find((s) => s.id === id)!);
  const { recalced, impact } = simulate(before, after, "sequence");
  if (opts.dryRun) return { impact };
  await prisma.$transaction(async (tx) => {
    await persistOrder(tx, after, recalced);
    await recordChange(tx, { tripId, actorId: userId, entity: "day", entityId: dayId, action: "reorder", after: { order: orderedIds } });
  });
  return { impact };
}

/**
 * Moves a stop to another day (or to unscheduled ideas when targetDayId is null).
 * Booking projections move by changing the booking's date (with confirmation for confirmed bookings).
 */
export async function moveStop(
  userId: string,
  tripId: string,
  stopId: string,
  target: { dayId: string | null; plan?: "A" | "B" },
  opts: { confirm?: boolean; dryRun?: boolean; version: number },
) {
  await requireTrip(tripId, userId, "edit");
  const stop = await loadStop(tripId, stopId);
  if (stop.version !== opts.version) throw conflictError(`“${stop.title}”`);
  const plan = target.plan ?? "A";
  const targetDay = target.dayId ? await prisma.itineraryDay.findFirst({ where: { id: target.dayId, tripId } }) : null;
  if (target.dayId && !targetDay) throw new AppError("NOT_FOUND", "Target day not found.");
  if (stop.booking && !targetDay) throw new AppError("VALIDATION", "Bookings can't become unscheduled ideas from here. Clear the booking date in the booking tracker if it's not scheduled.");
  if (!opts.dryRun) requireConfirmation(stop, opts.confirm, targetDay ? `It will move to ${targetDay.date}.` : "It will become an unscheduled idea.");

  const impacts: { label: string; impact: Impact }[] = [];
  if (stop.dayId) {
    const before = await dayStops(prisma, stop.dayId, stop.plan);
    const after = before.filter((s) => s.id !== stop.id);
    impacts.push({ label: "Original day", impact: simulate(before, after, "push").impact });
  }
  if (targetDay) {
    const before = await dayStops(prisma, targetDay.id, plan);
    const after = [...before.filter((s) => s.id !== stop.id), stop];
    impacts.push({ label: `New day (${targetDay.date})`, impact: simulate(before, after, "push", stop.isFixed || stop.booking ? {} : { [stop.id]: { startTime: null } }).impact });
  }
  if (opts.dryRun) return { impacts };

  await prisma.$transaction(async (tx) => {
    const position = targetDay ? await tx.stop.count({ where: { dayId: targetDay.id, plan } }) : 0;
    const res = await tx.stop.updateMany({
      where: { id: stop.id, version: opts.version },
      data: { dayId: targetDay?.id ?? null, plan, position, ...(stop.isFixed || stop.booking ? {} : { startTime: null }), version: { increment: 1 } },
    });
    if (res.count === 0) throw conflictError(`“${stop.title}”`);
    if (stop.booking && targetDay) await tx.booking.update({ where: { id: stop.booking.id }, data: { date: targetDay.date, version: { increment: 1 } } });
    if (stop.eventId && !targetDay) await tx.tripEvent.update({ where: { id: stop.eventId }, data: { status: "SAVED" } });
    for (const dId of [stop.dayId, targetDay?.id].filter((x): x is string => Boolean(x))) {
      const p = dId === targetDay?.id ? plan : stop.plan;
      const fresh = await dayStops(tx, dId, p);
      await persistOrder(tx, fresh, recalcDay(fresh.map(toSched), "push").stops);
    }
    await recordChange(tx, { tripId, actorId: userId, entity: "stop", entityId: stop.id, action: "move", before: { dayId: stop.dayId }, after: { dayId: targetDay?.id ?? null, plan } });
  });
  return { impacts };
}

export async function setActivePlan(userId: string, tripId: string, dayId: string, plan: "A" | "B") {
  await requireTrip(tripId, userId, "edit");
  await prisma.$transaction(async (tx) => {
    const res = await tx.itineraryDay.updateMany({ where: { id: dayId, tripId }, data: { activePlan: plan, version: { increment: 1 } } });
    if (!res.count) throw new AppError("NOT_FOUND", "Day not found.");
    await recordChange(tx, { tripId, actorId: userId, entity: "day", entityId: dayId, action: `plan_${plan}` });
  });
}

export async function updateDay(userId: string, tripId: string, dayId: string, patch: { title?: string | null; notes?: string | null; planBNote?: string | null }, version: number) {
  await requireTrip(tripId, userId, "edit");
  await prisma.$transaction(async (tx) => {
    const res = await tx.itineraryDay.updateMany({
      where: { id: dayId, tripId, version },
      data: { ...(patch.title !== undefined ? { title: patch.title?.slice(0, 120) || null } : {}), ...(patch.notes !== undefined ? { notes: patch.notes?.slice(0, 2000) || null } : {}), ...(patch.planBNote !== undefined ? { planBNote: patch.planBNote?.slice(0, 500) || null } : {}), version: { increment: 1 } },
    });
    if (!res.count) throw conflictError("This day");
    await recordChange(tx, { tripId, actorId: userId, entity: "day", entityId: dayId, action: "update", after: patch });
  });
}

/** Replaces a flexible stop with a chosen alternative, keeping its slot in the day. */
export async function replaceStop(userId: string, tripId: string, stopId: string, input: StopInput, opts: { version: number; dryRun?: boolean; origin?: "AI" | "MANUAL" }) {
  await requireTrip(tripId, userId, "edit");
  if (opts.origin === "AI") await requirePremiumAccess(tripId, "advancedPlanning");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const stop = await loadStop(tripId, stopId);
  if (stop.version !== opts.version) throw conflictError(`“${stop.title}”`);
  if (stop.isFixed || stop.booking) throw new AppError("VALIDATION", "Fixed commitments and bookings can't be swapped. Edit them directly instead.");
  const data = parseStop(input, trip.currency);
  let impact: Impact | null = null;
  if (stop.dayId) {
    const before = await dayStops(prisma, stop.dayId, stop.plan);
    impact = simulate(before, before, "push", {
      [stop.id]: { title: String(data.title), durationMin: (data.durationMin as number | null) ?? stop.durationMin, travelToNextMin: (data.travelToNextMin as number | null) ?? stop.travelToNextMin, estCostMinor: (data.estCostMinor as number | null) ?? null, startTime: stop.startTime },
    }).impact;
  }
  if (opts.dryRun) return { impact };
  await prisma.$transaction(async (tx) => {
    const res = await tx.stop.updateMany({
      where: { id: stopId, version: opts.version },
      data: {
        ...(data as Prisma.StopUpdateManyMutationInput),
        startTime: stop.startTime,
        status: opts.origin === "AI" ? "SUGGESTED" : "PLANNED",
        origin: opts.origin ?? "MANUAL",
        sourceUrls: [],
        version: { increment: 1 },
      },
    });
    if (!res.count) throw conflictError(`“${stop.title}”`);
    if (stop.dayId) {
      const fresh = await dayStops(tx, stop.dayId, stop.plan);
      await persistOrder(tx, fresh, recalcDay(fresh.map(toSched), "push").stops);
    }
    await recordChange(tx, { tripId, actorId: userId, entity: "stop", entityId: stopId, action: "swap", before: pick(stop), after: { title: data.title } });
  });
  return { impact };
}

// ───────────── Versions ─────────────

type SnapshotStop = Omit<Prisma.StopUncheckedCreateInput, "id" | "tripId" | "dayId" | "createdAt" | "updatedAt"> & { date: string | null };
type Snapshot = { days: { date: string; title: string | null; area: string | null; notes: string | null; questions: string[]; isTravelDay: boolean; driveMinutes: number | null; activePlan: string; planBNote: string | null; estCostMinor: number | null }[]; stops: SnapshotStop[] };

export async function snapshotItinerary(tx: Tx, tripId: string, reason: string, userId: string | null) {
  const days = await tx.itineraryDay.findMany({ where: { tripId }, include: { stops: true } });
  const ideas = await tx.stop.findMany({ where: { tripId, dayId: null } });
  const toSnap = (s: (typeof ideas)[number], date: string | null): SnapshotStop => ({
    date, plan: s.plan, position: s.position, title: s.title, category: s.category, locationName: s.locationName, address: s.address, lat: s.lat, lng: s.lng, reason: s.reason, startTime: s.startTime, durationMin: s.durationMin, travelToNextMin: s.travelToNextMin, travelMode: s.travelMode, travelNote: s.travelNote, officialUrl: s.officialUrl, sourceUrls: s.sourceUrls, estCostMinor: s.estCostMinor, currency: s.currency, bookingRequired: s.bookingRequired, bookingNote: s.bookingNote, hoursNote: s.hoursNote, notes: s.notes, status: s.status, isFixed: s.isFixed, isMeal: s.isMeal, isFreeTime: s.isFreeTime, indoor: s.indoor, origin: s.origin, eventId: s.eventId, createdById: s.createdById,
  });
  const snapshot: Snapshot = {
    days: days.map((d) => ({ date: d.date, title: d.title, area: d.area, notes: d.notes, questions: d.questions, isTravelDay: d.isTravelDay, driveMinutes: d.driveMinutes, activePlan: d.activePlan, planBNote: d.planBNote, estCostMinor: d.estCostMinor })),
    // Booking projections are not snapshotted: bookings are the canonical record and are never rolled back here.
    stops: [...days.flatMap((d) => d.stops.filter((s) => !s.bookingId).map((s) => toSnap(s, d.date))), ...ideas.filter((s) => !s.bookingId).map((s) => toSnap(s, null))],
  };
  return tx.itineraryVersion.create({ data: { tripId, reason, createdById: userId, snapshot: snapshot as unknown as Prisma.InputJsonValue } });
}

export async function listVersions(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "view");
  return prisma.itineraryVersion.findMany({ where: { tripId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, reason: true, createdAt: true, createdById: true } });
}

export async function restoreVersion(userId: string, tripId: string, versionId: string) {
  await requireTrip(tripId, userId, "edit");
  const v = await prisma.itineraryVersion.findFirst({ where: { id: versionId, tripId } });
  if (!v) throw new AppError("NOT_FOUND", "Version not found.");
  const snap = v.snapshot as unknown as Snapshot;
  await prisma.$transaction(async (tx) => {
    await snapshotItinerary(tx, tripId, `Before restoring “${v.reason}”`, userId);
    await tx.stop.deleteMany({ where: { tripId, bookingId: null } });
    const days = await tx.itineraryDay.findMany({ where: { tripId } });
    const byDate = new Map(days.map((d) => [d.date, d]));
    for (const d of snap.days) {
      const day = byDate.get(d.date);
      if (day) await tx.itineraryDay.update({ where: { id: day.id }, data: { title: d.title, area: d.area, notes: d.notes, questions: d.questions, isTravelDay: d.isTravelDay, driveMinutes: d.driveMinutes, activePlan: d.activePlan, planBNote: d.planBNote, estCostMinor: d.estCostMinor, version: { increment: 1 } } });
    }
    const liveEvents = new Set((await tx.tripEvent.findMany({ where: { tripId }, select: { id: true } })).map((e) => e.id));
    const bookedEvents = new Set((await tx.booking.findMany({ where: { tripId, eventId: { not: null } }, select: { eventId: true } })).map(b => b.eventId));
    for (const s of snap.stops) {
      const { date, ...rest } = s;
      // An event may have gained a canonical booking since this snapshot. That
      // reservation is not rolled back or duplicated by itinerary history.
      if (rest.eventId && bookedEvents.has(rest.eventId)) continue;
      const day = date ? byDate.get(date) : undefined;
      await tx.stop.create({ data: { ...rest, eventId: rest.eventId && liveEvents.has(rest.eventId) ? rest.eventId : null, tripId, dayId: day?.id ?? null } });
    }
    const scheduledEvents = new Set((await tx.stop.findMany({ where: { tripId, eventId: { not: null } }, select: { eventId: true } })).map((s) => s.eventId!));
    await tx.tripEvent.updateMany({ where: { tripId, status: "SCHEDULED", id: { notIn: [...scheduledEvents] } }, data: { status: "SAVED" } });
    await tx.tripEvent.updateMany({ where: { tripId, id: { in: [...scheduledEvents] } }, data: { status: "SCHEDULED" } });
    await recordChange(tx, { tripId, actorId: userId, entity: "itinerary", entityId: tripId, action: "restore", after: { versionId } });
  });
}

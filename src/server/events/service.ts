import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";
import { isDateStr, isTimeStr } from "@/lib/dates";
import { safeUrl } from "@/lib/maps";
import { findOverlaps, type SchedStop } from "@/server/itinerary/schedule";
import { stopInclude, toSched } from "@/server/itinerary/service";
import { formatZodError } from "@/server/trips/schemas";
import type { Prisma, TripEvent } from "@/generated/prisma/client";

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "at", "in", "de", "la", "le", "der", "die", "das", "el", "il", "festival", "exhibition"]);

/**
 * Identity of an event within a trip: normalized title + city/venue. Dates are deliberately excluded so that a
 * date change is detected as a change to the same event rather than appearing as a new one.
 */
export function eventDedupeKey(e: { title: string; city?: string | null; venue?: string | null }) {
  const norm = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w && !STOP_WORDS.has(w))
      .join(" ");
  const place = norm(e.city || e.venue || "").split(" ")[0] ?? "";
  return `${norm(e.title)}|${place}`;
}

export type EventFields = {
  title: string; category: string; date: string | null; startTime: string | null; endDate: string | null; dateVerified: boolean;
  venue: string | null; city: string | null; address: string | null; officialUrl: string | null; bookingUrl: string | null;
  priceText: string | null; availability: string | null; bookingDeadline: string | null; whyFits: string | null; uncertainty: string | null;
  cancelled: boolean; soldOut: boolean;
};

export type EventChange = { type: "date" | "venue" | "cancelled" | "sold_out" | "booking_open" | "price"; summary: string; at: string };

/** Material differences between the stored event and a fresh observation. */
export function detectChanges(prev: Pick<TripEvent, "date" | "startTime" | "venue" | "cancelled" | "soldOut" | "availability" | "priceText" | "bookingUrl">, next: EventFields, at = new Date()): EventChange[] {
  const out: EventChange[] = [];
  const iso = at.toISOString();
  if ((prev.date ?? null) !== next.date || (prev.startTime ?? null) !== next.startTime) {
    if (prev.date || next.date) out.push({ type: "date", summary: `Date/time changed from ${prev.date ?? "unknown"} ${prev.startTime ?? ""} to ${next.date ?? "unknown"} ${next.startTime ?? ""}`.replace(/\s+/g, " ").trim(), at: iso });
  }
  if (prev.venue && next.venue && prev.venue.toLowerCase() !== next.venue.toLowerCase()) out.push({ type: "venue", summary: `Venue changed from ${prev.venue} to ${next.venue}`, at: iso });
  if (!prev.cancelled && next.cancelled) out.push({ type: "cancelled", summary: "Reported as cancelled", at: iso });
  if (!prev.soldOut && next.soldOut) out.push({ type: "sold_out", summary: "Reported as sold out", at: iso });
  if (!prev.bookingUrl && next.bookingUrl) out.push({ type: "booking_open", summary: "Booking link now available", at: iso });
  if (prev.priceText && next.priceText && prev.priceText !== next.priceText) out.push({ type: "price", summary: `Price changed: ${prev.priceText} → ${next.priceText}`, at: iso });
  if (prev.availability && next.availability && prev.availability !== next.availability && !next.soldOut) out.push({ type: "price", summary: `Availability: ${prev.availability} → ${next.availability}`, at: iso });
  return out;
}

export function materialHash(e: EventFields) {
  return createHash("sha1").update(JSON.stringify([e.date, e.startTime, e.venue, e.cancelled, e.soldOut, e.priceText, e.availability, Boolean(e.bookingUrl)])).digest("hex");
}

/**
 * Upserts discovered events. New ones enter the shortlist with status NEW; known ones are updated and material
 * changes are recorded (never auto-scheduled). Hidden events stay hidden but still record changes.
 */
export async function upsertDiscoveredEvents(tripId: string, events: (EventFields & { sources: { url: string; title?: string | null }[] })[]) {
  let added = 0;
  let changed = 0;
  const changedEvents: { id: string; title: string; changes: EventChange[] }[] = [];
  const newEvents: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    const key = eventDedupeKey(e);
    if (!key.split("|")[0] || seen.has(key)) continue;
    seen.add(key);
    const existing = await prisma.tripEvent.findUnique({ where: { tripId_dedupeKey: { tripId, dedupeKey: key } } });
    const hash = materialHash(e);
    const sources = e.sources.map((s) => ({ url: safeUrl(s.url), title: s.title?.slice(0, 200) ?? null })).filter((s): s is { url: string; title: string | null } => Boolean(s.url)).slice(0, 5);
    const data = { ...e, officialUrl: safeUrl(e.officialUrl), bookingUrl: safeUrl(e.bookingUrl), lastCheckedAt: new Date(), changeHash: hash };
    const { sources: _s, ...fields } = data as typeof data & { sources?: unknown };
    if (!existing) {
      const created = await prisma.tripEvent.create({ data: { ...(fields as Prisma.TripEventUncheckedCreateInput), tripId, dedupeKey: key, origin: "discovered", status: "NEW", sources: { create: sources } } });
      added++;
      newEvents.push({ id: created.id, title: created.title });
      continue;
    }
    if (existing.origin === "user") continue; // never overwrite a traveler's own entry
    const changes = existing.changeHash === hash ? [] : detectChanges(existing, e);
    const prevChanges = (existing.changes as EventChange[] | null) ?? [];
    await prisma.tripEvent.update({
      where: { id: existing.id },
      data: {
        ...(fields as Prisma.TripEventUncheckedUpdateInput),
        changes: changes.length ? ([...prevChanges, ...changes].slice(-10) as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    for (const s of sources) await prisma.eventSource.upsert({ where: { eventId_url: { eventId: existing.id, url: s.url } }, create: { eventId: existing.id, ...s }, update: { retrievedAt: new Date() } });
    if (changes.length) {
      changed++;
      changedEvents.push({ id: existing.id, title: existing.title, changes });
    }
  }
  return { added, changed, newEvents, changedEvents };
}

export async function listEvents(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId, "view");
  const [events, runs, trip] = await Promise.all([
    prisma.tripEvent.findMany({ where: { tripId }, include: { booking: { select: { id: true, status: true } }, sources: true, stop: { select: { id: true, dayId: true, day: { select: { date: true } } } } }, orderBy: [{ date: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }] }),
    prisma.discoveryRun.findMany({ where: { tripId }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { autoDiscovery: true, discoveryEveryHours: true, nextDiscoveryAt: true } }),
  ]);
  const lastSuccess = await prisma.discoveryRun.findFirst({ where: { tripId, status: "succeeded" }, orderBy: { finishedAt: "desc" } });
  return { access, events, runs, lastSuccess, settings: trip };
}

export async function setEventStatus(userId: string, tripId: string, eventId: string, status: "SAVED" | "HIDDEN" | "NEW") {
  await requireTrip(tripId, userId, "edit");
  const e = await prisma.tripEvent.findFirst({ where: { id: eventId, tripId }, include: { stop: true } });
  if (!e) throw new AppError("NOT_FOUND", "Event not found.");
  if (e.stop && status === "HIDDEN") throw new AppError("VALIDATION", "This event is on your itinerary. Remove it from the day first.");
  await prisma.$transaction(async (tx) => {
    await tx.tripEvent.update({ where: { id: eventId }, data: { status } });
    await recordChange(tx, { tripId, actorId: userId, entity: "event", entityId: eventId, action: status.toLowerCase() });
  });
}

export async function acknowledgeEventChanges(userId: string, tripId: string, eventId: string) {
  await requireTrip(tripId, userId, "edit");
  await prisma.tripEvent.updateMany({ where: { id: eventId, tripId }, data: { changes: [] as unknown as Prisma.InputJsonValue } });
}

const customEvent = z.object({
  title: z.string().trim().min(1, "Add a title").max(160),
  category: z.string().trim().max(40).default("event"),
  date: z.string().optional().nullable().refine((v) => !v || isDateStr(v), "Invalid date"),
  startTime: z.string().optional().nullable().refine((v) => !v || isTimeStr(v), "Use HH:MM"),
  venue: z.string().max(160).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  officialUrl: z.string().max(500).optional().nullable(),
  bookingUrl: z.string().max(500).optional().nullable(),
  priceText: z.string().max(80).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function addCustomEvent(userId: string, tripId: string, input: z.input<typeof customEvent>) {
  await requireTrip(tripId, userId, "edit");
  const r = customEvent.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION", formatZodError(r.error));
  const d = r.data;
  if ([d.officialUrl, d.bookingUrl].some(url => url && !safeUrl(url))) throw new AppError("VALIDATION", "Links must start with https:// or http://");
  const key = eventDedupeKey(d);
  const dup = await prisma.tripEvent.findUnique({ where: { tripId_dedupeKey: { tripId, dedupeKey: key } } });
  if (dup) throw new AppError("VALIDATION", `“${dup.title}” is already in the shortlist${dup.status === "HIDDEN" ? " (hidden — restore it instead)" : ""}.`);
  return prisma.$transaction(async (tx) => {
    const e = await tx.tripEvent.create({
      data: { tripId, dedupeKey: key, title: d.title, category: d.category, date: d.date || null, startTime: d.startTime || null, dateVerified: false, venue: d.venue || null, city: d.city || null, officialUrl: safeUrl(d.officialUrl), bookingUrl: safeUrl(d.bookingUrl), priceText: d.priceText || null, whyFits: d.notes || null, origin: "user", status: "SAVED" },
    });
    await recordChange(tx, { tripId, actorId: userId, entity: "event", entityId: e.id, action: "create" });
    return e;
  });
}

/** Previews adding an event to a day: returns overlaps with existing stops (fixed ones flagged as conflicts). */
export async function previewScheduleEvent(userId: string, tripId: string, eventId: string, dayId: string, startTime: string | null, durationMin: number) {
  await requireTrip(tripId, userId, "edit");
  const [e, day] = await Promise.all([prisma.tripEvent.findFirst({ where: { id: eventId, tripId } }), prisma.itineraryDay.findFirst({ where: { id: dayId, tripId } })]);
  if (!e || !day) throw new AppError("NOT_FOUND", "Event or day not found.");
  const stops = await prisma.stop.findMany({ where: { dayId, plan: day.activePlan }, include: stopInclude });
  const time = startTime ?? e.startTime;
  const candidate: SchedStop = { id: "__event", title: e.title, startTime: time, durationMin, travelToNextMin: 0, anchored: false, isMeal: false, skipped: false, estCostMinor: null };
  const conflicts = time ? findOverlaps([...stops.map(toSched), candidate]).filter((c) => c.message.includes(e.title)) : [];
  const warnings: string[] = [];
  if (e.date && e.date !== day.date && !(e.endDate && day.date >= e.date && day.date <= e.endDate)) warnings.push(`The event's listed date is ${e.date}${e.endDate ? `–${e.endDate}` : ""}, not ${day.date}.`);
  if (!e.dateVerified) warnings.push("The date and time are not verified — check the official source before relying on it.");
  if (e.cancelled) warnings.push("This event was reported as cancelled.");
  if (e.soldOut) warnings.push("This event was reported as sold out.");
  if (!time) warnings.push("No start time is known; it will be added without a time.");
  return { conflicts, warnings, date: day.date };
}

export async function scheduleEvent(userId: string, tripId: string, eventId: string, dayId: string, startTime: string | null, durationMin: number) {
  await requireTrip(tripId, userId, "edit");
  if (startTime && !isTimeStr(startTime)) throw new AppError("VALIDATION", "Use HH:MM for the time.");
  const e = await prisma.tripEvent.findFirst({ where: { id: eventId, tripId }, include: { stop: true, booking: true } });
  if (!e) throw new AppError("NOT_FOUND", "Event not found.");
  if (e.stop) throw new AppError("CONFLICT", "This event is already on your itinerary.");
  if (e.booking?.status === "CANCELLED") throw new AppError("VALIDATION", "Reopen the linked booking before adding this event to a day.");
  const day = await prisma.itineraryDay.findFirst({ where: { id: dayId, tripId } });
  if (!day) throw new AppError("NOT_FOUND", "Day not found.");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  return prisma.$transaction(async (tx) => {
    const stops = await tx.stop.findMany({ where: { dayId, plan: day.activePlan }, orderBy: { position: "asc" } });
    const time = startTime ?? e.startTime;
    if (e.booking) await tx.booking.update({ where: { id: e.booking.id }, data: { date: day.date, startTime: time, durationMin: Math.max(15, Math.min(720, durationMin)), version: { increment: 1 } } });
    // Insert in chronological position among timed stops.
    let position = stops.length;
    if (time) {
      const idx = stops.findIndex((s) => s.startTime && s.startTime > time);
      if (idx >= 0) position = idx;
    }
    for (const s of stops.slice(position)) await tx.stop.update({ where: { id: s.id }, data: { position: s.position + 1 } });
    const stop = await tx.stop.create({
      data: {
        tripId, dayId, plan: day.activePlan, position, title: e.title, category: "event", locationName: e.venue, address: e.address, startTime: time, durationMin: Math.max(15, Math.min(720, durationMin)),
        reason: e.whyFits, officialUrl: e.bookingUrl ?? e.officialUrl, sourceUrls: e.officialUrl ? [e.officialUrl] : [], status: "PLANNED", origin: "EVENT", eventId: e.id, bookingId: e.booking?.id, currency: trip.currency,
        hoursNote: e.dateVerified ? null : "Event date/time not verified", createdById: userId,
      },
    });
    await tx.tripEvent.update({ where: { id: e.id }, data: { status: "SCHEDULED" } });
    await recordChange(tx, { tripId, actorId: userId, entity: "event", entityId: e.id, action: "schedule", after: { dayId, time } });
    return stop;
  });
}

export async function updateDiscoverySettings(userId: string, tripId: string, input: { autoDiscovery: boolean; everyHours: number }) {
  await requireTrip(tripId, userId, "edit");
  const every = [6, 12, 24, 72, 168].includes(input.everyHours) ? input.everyHours : 24;
  await prisma.trip.update({ where: { id: tripId }, data: { autoDiscovery: input.autoDiscovery, discoveryEveryHours: every, nextDiscoveryAt: input.autoDiscovery ? new Date(Date.now() + 60_000) : null } });
}

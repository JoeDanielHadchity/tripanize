import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { AppError, conflictError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { getTripPlan, requirePremiumAccess } from "@/server/plans/access";
import { recordChange } from "@/server/audit";
import { isDateStr, isTimeStr } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { safeUrl } from "@/lib/maps";
import { formatZodError } from "@/server/trips/schemas";
import type { Booking } from "@/generated/prisma/client";

const CATS = ["ACCOMMODATION", "FLIGHT", "TRAIN", "TRANSPORT", "CAR_RENTAL", "ATTRACTION", "RESTAURANT", "EXPERIENCE", "OTHER"] as const;
const STATUSES = ["IDEA", "TO_BOOK", "REQUESTED", "BOOKED", "PAID", "CANCELLED"] as const;

const nul = (v: unknown) => (v === "" || v === undefined ? null : v);

export const bookingInput = z.object({
  title: z.string().trim().min(1, "Give the booking a title").max(160),
  category: z.enum(CATS),
  date: z.preprocess(nul, z.string().nullable().refine((v) => v === null || isDateStr(v), "Invalid date")),
  startTime: z.preprocess(nul, z.string().nullable().refine((v) => v === null || isTimeStr(v), "Use HH:MM")),
  endDate: z.preprocess(nul, z.string().nullable().refine((v) => v === null || isDateStr(v), "Invalid end date")),
  durationMin: z.preprocess(nul, z.coerce.number().int().min(0).max(60 * 24 * 60).nullable()),
  guests: z.preprocess(nul, z.string().max(300).nullable()),
  status: z.enum(STATUSES),
  priority: z.coerce.number().int().min(1).max(3).default(2),
  whenToBook: z.preprocess(nul, z.string().max(300).nullable()),
  estCost: z.preprocess(nul, z.string().max(20).nullable()),
  finalCost: z.preprocess(nul, z.string().max(20).nullable()),
  currency: z.string().regex(/^[A-Z]{3}$/),
  ticketType: z.preprocess(nul, z.string().max(160).nullable()),
  preferences: z.preprocess(nul, z.string().max(500).nullable()),
  address: z.preprocess(nul, z.string().max(300).nullable()),
  bookingUrl: z.preprocess(nul, z.string().max(500).nullable()),
  confirmationRef: z.preprocess(nul, z.string().max(120).nullable()),
  notes: z.preprocess(nul, z.string().max(2000).nullable()),
  cancellationTerms: z.preprocess(nul, z.string().max(1000).nullable()),
});
type Opt<T> = T | null | undefined;
export type BookingInput = {
  title: string; category: (typeof CATS)[number]; status: (typeof STATUSES)[number]; currency: string;
  eventId?: string | null;
  date?: Opt<string>; startTime?: Opt<string>; endDate?: Opt<string>; durationMin?: Opt<number | string>; guests?: Opt<string>;
  priority?: number | string; whenToBook?: Opt<string>; estCost?: Opt<string>; finalCost?: Opt<string>; ticketType?: Opt<string>;
  preferences?: Opt<string>; address?: Opt<string>; bookingUrl?: Opt<string>; confirmationRef?: Opt<string>; notes?: Opt<string>; cancellationTerms?: Opt<string>;
};

function toData(input: BookingInput) {
  const r = bookingInput.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION", formatZodError(r.error));
  const d = r.data;
  // Never store payment card numbers, even by accident in free-text fields.
  for (const v of [d.notes, d.confirmationRef, d.preferences, d.guests]) {
    if (v && /\b(?:\d[ -]?){13,19}\b/.test(v)) throw new AppError("VALIDATION", "That looks like a card number. Tripanize doesn't store payment card details — please remove it.");
  }
  if (d.bookingUrl && !safeUrl(d.bookingUrl)) throw new AppError("VALIDATION", "The booking link must start with https:// or http://");
  const est = d.estCost ? parseMoney(d.estCost, d.currency) : null;
  const fin = d.finalCost ? parseMoney(d.finalCost, d.currency) : null;
  if (d.estCost && est === null) throw new AppError("VALIDATION", "Estimated cost must be a number");
  if (d.finalCost && fin === null) throw new AppError("VALIDATION", "Final cost must be a number");
  if (d.endDate && d.date && d.endDate < d.date) throw new AppError("VALIDATION", "End date is before the start date");
  const { estCost: _e, finalCost: _f, ...rest } = d;
  return { ...rest, bookingUrl: safeUrl(d.bookingUrl), estCostMinor: est, finalCostMinor: fin };
}

/**
 * Keeps the single itinerary projection of a booking in sync with the canonical booking:
 *  - a dated, non-cancelled booking within the trip appears on its day exactly once;
 *  - an undated or cancelled booking never appears in a daily itinerary.
 */
export async function syncBookingProjection(tx: Tx, booking: Booking) {
  const existing = await tx.stop.findUnique({ where: { bookingId: booking.id } }) ??
    (booking.eventId ? await tx.stop.findUnique({ where: { eventId: booking.eventId } }) : null);
  const day = booking.date && booking.status !== "CANCELLED" ? await tx.itineraryDay.findUnique({ where: { tripId_date: { tripId: booking.tripId, date: booking.date } } }) : null;
  if (!day) {
    if (existing) await tx.stop.delete({ where: { id: existing.id } });
    if (booking.eventId) await tx.tripEvent.updateMany({ where: { id: booking.eventId, status: "SCHEDULED" }, data: { status: "SAVED" } });
    return;
  }
  // Tracking a suggestion does not schedule it. Confirmed tickets, or an event
  // the traveler already scheduled, share a single itinerary entry.
  if (booking.eventId && !existing && !["BOOKED", "PAID"].includes(booking.status)) return;
  const category = booking.category === "RESTAURANT" ? "food" : booking.category === "ACCOMMODATION" ? "accommodation" : ["FLIGHT", "TRAIN", "TRANSPORT", "CAR_RENTAL"].includes(booking.category) ? "transport" : "activity";
  if (!existing) {
    const position = await tx.stop.count({ where: { dayId: day.id, plan: "A" } });
    await tx.stop.create({
      data: { tripId: booking.tripId, dayId: day.id, plan: "A", position, title: booking.title, category, origin: "BOOKING", bookingId: booking.id, eventId: booking.eventId, status: "PLANNED", isMeal: booking.category === "RESTAURANT" },
    });
  } else if (existing.dayId !== day.id) {
    const position = await tx.stop.count({ where: { dayId: day.id, plan: "A" } });
    await tx.stop.update({ where: { id: existing.id }, data: { dayId: day.id, plan: "A", position, bookingId: booking.id, eventId: booking.eventId, version: { increment: 1 } } });
  } else if (booking.eventId && existing.bookingId !== booking.id) {
    await tx.stop.update({ where: { id: existing.id }, data: { bookingId: booking.id, version: { increment: 1 } } });
  }
  if (booking.eventId) await tx.tripEvent.update({ where: { id: booking.eventId }, data: { status: "SCHEDULED" } });
}

export async function listBookings(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId, "view");
  const { premium } = await getTripPlan(tripId);
  const bookings = await prisma.booking.findMany({
    where: { tripId },
    include: { event: { select: { id: true, title: true, cancelled: true, soldOut: true } }, attachments: { select: { id: true, fileName: true, sizeBytes: true, mimeType: true } }, expenses: { where: { deletedAt: null, ...(!premium ? { id: "" } : {}) }, select: { id: true, amountMinor: true, currency: true } }, stop: { select: { id: true, dayId: true } } },
    orderBy: [{ date: { sort: "asc", nulls: "last" } }, { startTime: { sort: "asc", nulls: "last" } }, { priority: "asc" }],
  });
  const suggestedEvents = await prisma.tripEvent.findMany({
    where: { tripId, origin: "discovered", status: { not: "HIDDEN" }, cancelled: false, booking: null, ...(!premium ? { id: "" } : {}) },
    include: { stop: { select: { startTime: true, durationMin: true, day: { select: { date: true } } } } },
    orderBy: [{ date: { sort: "asc", nulls: "last" } }, { title: "asc" }],
  });
  return { access, bookings, suggestedEvents, premium };
}

export async function createBooking(userId: string, tripId: string, input: BookingInput) {
  await requireTrip(tripId, userId, "edit");
  const data = toData(input);
  return prisma.$transaction(async (tx) => {
    let eventId: string | null = null;
    if (input.eventId) {
      await requirePremiumAccess(tripId, "events", tx);
      if (typeof input.eventId !== "string" || input.eventId.length > 100) throw new AppError("VALIDATION", "Invalid event.");
      const event = await tx.tripEvent.findFirst({ where: { id: input.eventId, tripId } });
      if (!event) throw new AppError("NOT_FOUND", "Event not found in this trip.");
      // Retried submissions and two travelers clicking at once reuse one record.
      const linked = await tx.booking.findUnique({ where: { eventId: event.id } });
      if (linked) return linked;
      if (event.cancelled && data.status !== "CANCELLED") throw new AppError("VALIDATION", "This event is reported cancelled. Check the event before tracking a booking.");
      eventId = event.id;
    }
    const b = await tx.booking.create({ data: { ...data, eventId, tripId, createdById: userId } });
    await syncBookingProjection(tx, b);
    await recordChange(tx, { tripId, actorId: userId, entity: "booking", entityId: b.id, action: "create", after: { title: b.title, status: b.status } });
    return b;
  });
}

export async function updateBooking(userId: string, tripId: string, bookingId: string, input: BookingInput, version: number) {
  await requireTrip(tripId, userId, "edit");
  const data = toData(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.booking.findFirst({ where: { id: bookingId, tripId } });
    if (!before) throw new AppError("NOT_FOUND", "Booking not found.");
    const res = await tx.booking.updateMany({ where: { id: bookingId, tripId, version }, data: { ...data, version: { increment: 1 } } });
    if (!res.count) throw conflictError(`The booking “${before.title}”`);
    const after = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await syncBookingProjection(tx, after);
    await recordChange(tx, { tripId, actorId: userId, entity: "booking", entityId: bookingId, action: "update", before: { status: before.status, date: before.date, startTime: before.startTime }, after: { status: after.status, date: after.date, startTime: after.startTime } });
    return after;
  });
}

export async function setBookingStatus(userId: string, tripId: string, bookingId: string, status: (typeof STATUSES)[number], version: number) {
  await requireTrip(tripId, userId, "edit");
  if (!STATUSES.includes(status)) throw new AppError("VALIDATION", "Unknown status");
  return prisma.$transaction(async (tx) => {
    const res = await tx.booking.updateMany({ where: { id: bookingId, tripId, version }, data: { status, version: { increment: 1 } } });
    if (!res.count) throw conflictError("This booking");
    const b = await tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    await syncBookingProjection(tx, b);
    await recordChange(tx, { tripId, actorId: userId, entity: "booking", entityId: bookingId, action: "status", after: { status } });
    return b;
  });
}

export async function deleteBooking(userId: string, tripId: string, bookingId: string) {
  await requireTrip(tripId, userId, "edit");
  await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findFirst({ where: { id: bookingId, tripId } });
    if (!b) throw new AppError("NOT_FOUND", "Booking not found.");
    if (b.eventId) await tx.tripEvent.updateMany({ where: { id: b.eventId, status: "SCHEDULED" }, data: { status: "SAVED" } });
    // Expenses keep their history; only the link is cleared (onDelete: SetNull). The projection stop cascades.
    await tx.booking.delete({ where: { id: bookingId } });
    await recordChange(tx, { tripId, actorId: userId, entity: "booking", entityId: bookingId, action: "delete", before: { title: b.title, status: b.status } });
  });
}

import { prisma, type Tx } from "@/server/db";
import { AppError, conflictError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";
import { dateRange, todayIn, tripPhase } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { syncBookingProjection } from "@/server/bookings/service";
import { formatZodError, tripInput, type TripInput, type TripParsed } from "./schemas";

function parse(input: TripInput): TripParsed {
  const r = tripInput.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION", formatZodError(r.error));
  return r.data;
}

function budgetMinor(t: TripParsed) {
  if (!t.budget) return null;
  const m = parseMoney(t.budget, t.currency);
  if (m === null) throw new AppError("VALIDATION", "Budget must be a number, e.g. 2500 or 2500.00");
  return m;
}

function scalarFields(t: TripParsed) {
  return {
    name: t.name,
    startDate: t.startDate,
    endDate: t.endDate,
    timezone: t.timezone ?? "UTC",
    currency: t.currency,
    budgetMinor: budgetMinor(t),
    pace: t.pace,
    interests: t.interests,
    transport: t.transport,
    accessibility: t.accessibility,
    preferences: t.preferences,
    dietary: t.dietary,
    restaurantPrefs: t.restaurantPrefs,
    departureCity: t.departureCity,
    arrivalLocation: t.arrivalLocation,
    arrivalAt: t.arrivalAt,
    departureLocation: t.departureLocation,
    departureAt: t.departureAt,
    adults: t.adults,
    children: t.children,
    isRoadTrip: t.isRoadTrip,
    carPickupLocation: t.carPickupLocation,
    carPickupAt: t.carPickupAt,
    carReturnLocation: t.carReturnLocation,
    carReturnAt: t.carReturnAt,
    notes: t.notes,
  };
}

/**
 * Makes sure there is exactly one ItineraryDay per trip date and that each day points at the destination
 * the travelers sleep in / spend that day in. Days that fall outside new trip dates are removed, but their
 * stops are kept as unscheduled ideas — never silently deleted.
 */
export async function syncDays(tx: Tx, tripId: string) {
  const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" } }, days: true } });
  const dates = trip.startDate && trip.endDate ? dateRange(trip.startDate, trip.endDate) : [];
  const keep = new Set(dates);
  const orphanDays = trip.days.filter((d) => !keep.has(d.date));
  if (orphanDays.length) {
    const ids = orphanDays.map((d) => d.id);
    // Booking projections follow their booking; other stops become unscheduled ideas.
    await tx.stop.updateMany({ where: { dayId: { in: ids }, bookingId: null }, data: { dayId: null, plan: "A" } });
    await tx.itineraryDay.deleteMany({ where: { id: { in: ids } } });
  }
  const destFor = (date: string) => {
    // The last destination whose stay covers the date (on a moving day that is where you sleep).
    let match: (typeof trip.destinations)[number] | null = null;
    for (const d of trip.destinations) {
      const from = d.arriveDate ?? trip.startDate;
      const to = d.departDate ?? trip.endDate;
      if (from && to && date >= from && date <= to) match = d;
    }
    return match ?? (trip.destinations.length === 1 ? trip.destinations[0] : null);
  };
  const existing = new Map(trip.days.map((d) => [d.date, d]));
  for (const date of dates) {
    const dest = destFor(date);
    const isMove = trip.destinations.some((d, i) => i > 0 && d.arriveDate === date);
    const day = existing.get(date);
    if (!day) {
      await tx.itineraryDay.create({ data: { tripId, date, destinationId: dest?.id ?? null, isTravelDay: isMove } });
    } else if (day.destinationId !== (dest?.id ?? null) || (isMove && !day.isTravelDay)) {
      await tx.itineraryDay.update({ where: { id: day.id }, data: { destinationId: dest?.id ?? null, isTravelDay: day.isTravelDay || isMove } });
    }
  }
  // Dated bookings follow the (possibly new) set of days.
  for (const b of await tx.booking.findMany({ where: { tripId } })) await syncBookingProjection(tx, b);
}

async function writeCommitments(tx: Tx, tripId: string, userId: string, t: TripParsed) {
  for (const c of t.commitments) {
    const day = await tx.itineraryDay.findUnique({ where: { tripId_date: { tripId, date: c.date } } });
    const count = day ? await tx.stop.count({ where: { dayId: day.id } }) : 0;
    await tx.stop.create({
      data: {
        tripId,
        dayId: day?.id ?? null,
        title: c.title,
        category: "event",
        startTime: c.startTime,
        durationMin: c.durationMin ?? null,
        address: c.location,
        isFixed: true,
        status: "CONFIRMED",
        origin: "COMMITMENT",
        position: count,
        notes: day ? null : `Fixed commitment on ${c.date}`,
        createdById: userId,
      },
    });
  }
}

export async function createTrip(userId: string, input: TripInput) {
  const t = parse(input);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const tripId = await prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({ data: { ...scalarFields(t), ownerId: userId } });
    const me = await tx.traveler.create({ data: { tripId: trip.id, name: user.name, userId } });
    await tx.tripMembership.create({ data: { tripId: trip.id, userId, role: "OWNER", travelerId: me.id } });
    const seen = new Set([user.name.trim().toLowerCase()]);
    for (const tr of t.travelers) {
      const key = tr.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      await tx.traveler.create({ data: { tripId: trip.id, name: tr.name, isChild: tr.isChild } });
    }
    await Promise.all(
      t.destinations.map((d, i) =>
        tx.destination.create({
          data: { tripId: trip.id, position: i, name: d.name, country: d.country, arriveDate: d.arriveDate, departDate: d.departDate, accommodationName: d.accommodationName, accommodationAddress: d.accommodationAddress, neighborhood: d.neighborhood, checkInTime: d.checkInTime, checkOutTime: d.checkOutTime, parkingNotes: d.parkingNotes },
        }),
      ),
    );
    for (const name of t.mustSee) await tx.tripPlace.create({ data: { tripId: trip.id, kind: "MUST_SEE", name } });
    for (const name of t.optional) await tx.tripPlace.create({ data: { tripId: trip.id, kind: "OPTIONAL", name } });
    await syncDays(tx, trip.id);
    await writeCommitments(tx, trip.id, userId, t);
    await tx.notificationPreference.create({ data: { userId, tripId: trip.id, emailEnabled: false, changeTypes: ["date", "venue", "cancelled", "sold_out"] } });
    await recordChange(tx, { tripId: trip.id, actorId: userId, entity: "trip", entityId: trip.id, action: "create", after: { name: t.name } });
    return trip.id;
  });
  return tripId;
}

/** Updates trip details. Destinations are replaced by the submitted list (matched by id). */
export async function updateTrip(userId: string, tripId: string, input: TripInput, expectedVersion: number) {
  await requireTrip(tripId, userId, "edit");
  const t = parse(input);
  await prisma.$transaction(async (tx) => {
    const res = await tx.trip.updateMany({ where: { id: tripId, version: expectedVersion }, data: { ...scalarFields(t), version: { increment: 1 } } });
    if (res.count === 0) throw conflictError("The trip details");
    const existing = await tx.destination.findMany({ where: { tripId } });
    const submittedIds = new Set(t.destinations.map((d) => d.id).filter(Boolean));
    const removed = existing.filter((d) => !submittedIds.has(d.id));
    if (removed.length) await tx.destination.deleteMany({ where: { id: { in: removed.map((d) => d.id) } } });
    for (const [i, d] of t.destinations.entries()) {
      const data = { position: i, name: d.name, country: d.country, arriveDate: d.arriveDate, departDate: d.departDate, accommodationName: d.accommodationName, accommodationAddress: d.accommodationAddress, neighborhood: d.neighborhood, checkInTime: d.checkInTime, checkOutTime: d.checkOutTime, parkingNotes: d.parkingNotes };
      const prev = d.id ? existing.find((x) => x.id === d.id) : undefined;
      if (prev) {
        // Name change invalidates cached coordinates.
        await tx.destination.update({ where: { id: prev.id }, data: { ...data, ...(prev.name !== d.name ? { lat: null, lng: null, timezone: null } : {}), version: { increment: 1 } } });
      } else await tx.destination.create({ data: { ...data, tripId } });
    }
    await tx.tripPlace.deleteMany({ where: { tripId } });
    for (const name of t.mustSee) await tx.tripPlace.create({ data: { tripId, kind: "MUST_SEE", name } });
    for (const name of t.optional) await tx.tripPlace.create({ data: { tripId, kind: "OPTIONAL", name } });
    await syncDays(tx, tripId);
    await recordChange(tx, { tripId, actorId: userId, entity: "trip", entityId: tripId, action: "update" });
  });
}

/**
 * Previews the effect of changing trip dates or destinations before saving:
 * which days disappear (their stops become unscheduled ideas), which days change destination,
 * and which confirmed bookings fall outside the new dates.
 */
export async function previewTripChange(userId: string, tripId: string, input: TripInput) {
  await requireTrip(tripId, userId, "edit");
  const t = parse(input);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { days: { include: { stops: true, destination: true } }, bookings: true } });
  const newDates = new Set(t.startDate && t.endDate ? dateRange(t.startDate, t.endDate) : []);
  const removedDays = trip.days.filter((d) => !newDates.has(d.date));
  const destName = (date: string) => {
    let match: string | null = null;
    for (const d of t.destinations) {
      const from = d.arriveDate ?? t.startDate;
      const to = d.departDate ?? t.endDate;
      if (from && to && date >= from && date <= to) match = d.name;
    }
    return match ?? (t.destinations.length === 1 ? t.destinations[0].name : null);
  };
  const changedDays = trip.days
    .filter((d) => newDates.has(d.date))
    .map((d) => ({ date: d.date, from: d.destination?.name ?? null, to: destName(d.date), stops: d.stops.filter((s) => !s.bookingId).length }))
    .filter((d) => d.from !== d.to);
  const bookingsOutside = trip.bookings.filter((b) => b.date && !newDates.has(b.date) && b.status !== "CANCELLED");
  return {
    removedDays: removedDays.map((d) => ({ date: d.date, stops: d.stops.filter((s) => !s.bookingId).length })),
    changedDays,
    bookingsOutside: bookingsOutside.map((b) => ({ id: b.id, title: b.title, date: b.date, status: b.status })),
  };
}

export async function deleteTrip(userId: string, tripId: string, confirmName: string) {
  await requireTrip(tripId, userId, "manage");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  if (confirmName.trim() !== trip.name.trim()) throw new AppError("VALIDATION", "Type the trip name exactly to confirm deletion.");
  await prisma.trip.delete({ where: { id: tripId } });
}

export type TripCard = Awaited<ReturnType<typeof listTrips>>[number];

/** Only trips the user owns or is a member of. */
export async function listTrips(userId: string, opts: { q?: string; phase?: string } = {}) {
  const memberships = await prisma.tripMembership.findMany({
    where: { userId },
    include: {
      trip: {
        include: {
          destinations: { orderBy: { position: "asc" }, select: { name: true } },
          travelers: { where: { leftAt: null }, select: { id: true, name: true } },
        },
      },
    },
  });
  const q = opts.q?.trim().toLowerCase();
  return memberships
    .map((m) => {
      const t = m.trip;
      const today = todayIn(t.timezone);
      return {
        id: t.id,
        name: t.name,
        role: m.role,
        startDate: t.startDate,
        endDate: t.endDate,
        destinations: t.destinations.map((d) => d.name),
        travelers: t.travelers.map((x) => x.name),
        imageUrl: t.imageUrl,
        imageCredit: t.imageCredit,
        phase: tripPhase(t.startDate, t.endDate, today),
        updatedAt: t.updatedAt,
      };
    })
    .filter((t) => !q || t.name.toLowerCase().includes(q) || t.destinations.some((d) => d.toLowerCase().includes(q)) || t.travelers.some((x) => x.toLowerCase().includes(q)))
    .filter((t) => !opts.phase || opts.phase === "all" || t.phase === opts.phase)
    .sort((a, b) => {
      const rank = { current: 0, upcoming: 1, undated: 2, past: 3 } as const;
      return rank[a.phase] - rank[b.phase] || (a.phase === "past" ? (b.startDate ?? "").localeCompare(a.startDate ?? "") : (a.startDate ?? "9").localeCompare(b.startDate ?? "9"));
    });
}

/** Loads everything a trip page header needs, scoped by membership. */
export async function getTripHeader(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId, "view");
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { destinations: { orderBy: { position: "asc" } }, travelers: { where: { leftAt: null }, orderBy: { createdAt: "asc" } } },
  });
  return { access, trip };
}

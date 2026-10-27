import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { addDays, isDateStr } from "@/lib/dates";
import { createTrip } from "@/server/trips/service";
import { createBooking, type BookingInput } from "@/server/bookings/service";
import { EXAMPLES } from "./data";

/** Creates a real, editable trip from an example, shifted to the chosen start date. */
export async function copyExample(userId: string, slug: string, startDate: string) {
  const ex = EXAMPLES.find((e) => e.slug === slug);
  if (!ex) throw new AppError("NOT_FOUND", "Example not found.");
  if (!isDateStr(startDate) || new Date(`${startDate}T00:00:00Z`).toISOString().slice(0, 10) !== startDate) throw new AppError("VALIDATION", "Choose a valid start date.");
  const tripId = await createTrip(userId, {
    name: ex.name,
    startDate,
    endDate: addDays(startDate, ex.nights),
    timezone: ex.timezone,
    currency: ex.currency,
    budget: ex.budget === null ? undefined : String(ex.budget),
    interests: ex.interests,
    transport: ex.transport,
    mustSee: ex.mustSee,
    destinations: ex.destinations.map((d) => ({ name: d.name, country: d.country, arriveDate: addDays(startDate, d.fromOffset), departDate: addDays(startDate, d.toOffset), neighborhood: d.neighborhood })),
  });
  await prisma.trip.update({ where: { id: tripId }, data: { copiedFromExample: slug } });
  const days = await prisma.itineraryDay.findMany({ where: { tripId } });
  for (const d of ex.days) {
    const day = days.find((x) => x.date === addDays(startDate, d.offset));
    if (!day) continue;
    await prisma.itineraryDay.update({ where: { id: day.id }, data: { title: d.title, area: d.area, notes: d.notes ?? null, isTravelDay: Boolean(d.isTravelDay) } });
    let a = 0;
    let b = 0;
    for (const s of d.stops) {
      await prisma.stop.create({
        data: {
          tripId, dayId: day.id, plan: s.plan ?? "A", position: s.plan === "B" ? b++ : a++, title: s.title, category: s.category, startTime: s.startTime, durationMin: s.durationMin ?? null, travelToNextMin: s.travelToNextMin ?? null,
          address: s.address ?? null, reason: s.reason, notes: s.notes ?? null, estCostMinor: s.estCost === undefined ? null : Math.round(s.estCost * 100), currency: ex.currency, isMeal: Boolean(s.isMeal), isFreeTime: Boolean(s.isFreeTime),
          officialUrl: s.officialUrl ?? null, hoursNote: "Example content — check current opening hours", status: "PLANNED", origin: "MANUAL", createdById: userId,
        },
      });
    }
  }
  for (const bk of ex.bookings) {
    await createBooking(userId, tripId, { title: bk.title, category: bk.category as BookingInput["category"], date: bk.offset === null ? null : addDays(startDate, bk.offset), startTime: bk.startTime ?? null, status: bk.status, whenToBook: bk.whenToBook, estCost: bk.estCost === undefined ? undefined : String(bk.estCost), currency: ex.currency, bookingUrl: bk.url ?? null });
  }
  return tripId;
}

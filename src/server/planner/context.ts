import { prisma } from "@/server/db";
import { dateRange, todayIn } from "@/lib/dates";
import { minorToDecimalString } from "@/lib/money";
import { getTripWeather, ensureDestinationCoords } from "@/server/weather/trip";
import { estimateTravel, travelTime } from "@/server/routing";
import { effectiveStop, stopInclude } from "@/server/itinerary/service";

export type Anchor = { ref: string; date: string; title: string; startTime: string | null; durationMin: number | null; kind: string; status: string; address: string | null };

export type PlannerContext = Awaited<ReturnType<typeof buildContext>>;

/** Missing essentials that block generation. Everything else is optional and the plan adapts. */
export async function missingEssentials(tripId: string) {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: true } });
  const missing: { field: string; question: string }[] = [];
  if (!trip.startDate || !trip.endDate) missing.push({ field: "dates", question: "What are your travel dates?" });
  if (!trip.destinations.length) missing.push({ field: "destinations", question: "Where are you going? Add at least one destination." });
  if (trip.destinations.length > 1 && trip.destinations.some((d) => !d.arriveDate || !d.departDate)) {
    missing.push({ field: "destinationDates", question: "Which dates will you spend in each destination?" });
  }
  return missing;
}

export async function buildContext(tripId: string, targetDates: string[] | null) {
  const trip = await prisma.trip.findUniqueOrThrow({
    where: { id: tripId },
    include: { places: true, travelers: { where: { leftAt: null } }, bookings: { where: { status: { not: "CANCELLED" } } } },
  });
  const dests = await ensureDestinationCoords(tripId);
  const allDates = trip.startDate && trip.endDate ? dateRange(trip.startDate, trip.endDate) : [];
  const dates = targetDates?.length ? allDates.filter((d) => targetDates.includes(d)) : allDates;

  const days = await prisma.itineraryDay.findMany({ where: { tripId }, include: { stops: { include: stopInclude, orderBy: { position: "asc" } }, destination: true }, orderBy: { date: "asc" } });

  // Fixed commitments, confirmed/requested bookings and user-scheduled events are kept as-is by the planner.
  const anchors: Anchor[] = [];
  for (const d of days) {
    for (const s of d.stops) {
      const e = effectiveStop(s);
      if (s.isFixed || s.bookingId || s.eventId) {
        anchors.push({ ref: s.id, date: d.date, title: e.title, startTime: e.startTime, durationMin: e.durationMin, kind: s.isFixed ? "fixed commitment" : s.bookingId ? `booking (${s.booking?.category.toLowerCase()})` : "event chosen by travelers", status: s.booking ? s.booking.status : s.isFixed ? "CONFIRMED" : "PLANNED", address: e.address });
      }
    }
  }
  const undatedBookings = trip.bookings.filter((b) => !b.date).map((b) => ({ title: b.title, category: b.category, status: b.status }));
  const otherDaysPlanned = days.filter((d) => !dates.includes(d.date) && d.stops.length).map((d) => ({ date: d.date, stops: d.stops.filter((s) => s.status !== "SKIPPED").map((s) => effectiveStop(s).title) }));
  const ideas = await prisma.stop.findMany({ where: { tripId, dayId: null }, select: { title: true, notes: true } });

  let weather: Awaited<ReturnType<typeof getTripWeather>> | null = null;
  try {
    weather = await getTripWeather(tripId);
  } catch {
    weather = null;
  }

  // Inter-destination legs (driving/transit) for multi-city and road trips.
  const legs: { from: string; to: string; date: string | null; minutes: number; km: number; basis: string }[] = [];
  for (let i = 1; i < dests.length; i++) {
    const a = dests[i - 1];
    const b = dests[i];
    if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) continue;
    const mode = trip.isRoadTrip || trip.transport.some((t) => /car/i.test(t)) ? "driving" : "transit";
    const est = mode === "driving" ? await travelTime({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }, "driving") : estimateTravel({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }, "transit");
    legs.push({ from: a.name, to: b.name, date: b.arriveDate, minutes: est.minutes, km: est.km, basis: est.basis === "route" ? "routing service" : "straight-line estimate" });
  }

  const today = todayIn(trip.timezone);
  return {
    trip,
    today,
    dates,
    allDates,
    destinations: dests,
    anchors: anchors.filter((a) => dates.includes(a.date)),
    otherAnchors: anchors.filter((a) => !dates.includes(a.date)),
    undatedBookings,
    otherDaysPlanned,
    ideas,
    weather,
    legs,
    budget: trip.budgetMinor !== null ? `${minorToDecimalString(trip.budgetMinor, trip.currency)} ${trip.currency}` : null,
  };
}

import { prisma } from "@/server/db";
import { addDays, todayIn } from "@/lib/dates";
import { queuePush } from "./service";

/** Local wall-clock hour in a trip's time zone. */
function hourIn(timeZone: string, now: Date) {
  try { return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now)); }
  catch { return now.getUTCHours(); }
}

const DEPARTURE_HOUR = 18; // the evening before
const MORNING_HOUR = 7, MORNING_UNTIL = 12; // a late morning plan is still useful; an evening one is not

/** Runs from the hourly maintenance job. Each reminder has a per-trip, per-date
 * dedupe key, so repeated runs and restarts never send it twice. */
export async function queueTripReminders(now = new Date()) {
  const utcToday = now.toISOString().slice(0, 10);
  // Every IANA zone is within ±14 h of UTC, so ±2 days covers all local "todays".
  const trips = await prisma.trip.findMany({
    where: { startDate: { not: null, lte: addDays(utcToday, 3) }, OR: [{ endDate: null }, { endDate: { gte: addDays(utcToday, -2) } }], memberships: { some: { user: { pushDevices: { some: {} } } } } },
    select: { id: true, name: true, timezone: true, startDate: true, endDate: true, memberships: { select: { userId: true } } },
  });
  let queued = 0;
  for (const trip of trips) {
    const today = todayIn(trip.timezone, now), hour = hourIn(trip.timezone, now), start = trip.startDate!, end = trip.endDate ?? start;
    const userIds = trip.memberships.map(m => m.userId);
    if (today === addDays(start, -1) && hour >= DEPARTURE_HOUR) {
      queued += await prisma.$transaction(tx => queuePush(tx, {
        userIds, tripId: trip.id, category: "reminders", dedupeKey: `reminder:depart:${trip.id}:${start}`,
        title: `${trip.name} starts tomorrow`, body: "Check your bookings, documents and packing list before you go.", href: `/trips/${trip.id}/packing`,
      }));
    }
    if (today >= start && today <= end && hour >= MORNING_HOUR && hour < MORNING_UNTIL) {
      const day = await prisma.itineraryDay.findFirst({ where: { tripId: trip.id, date: today }, select: { title: true, activePlan: true, id: true } });
      const stops = day ? await prisma.stop.findMany({ where: { dayId: day.id, plan: day.activePlan, status: { not: "SKIPPED" } }, orderBy: [{ position: "asc" }], select: { title: true, startTime: true }, take: 12 }) : [];
      const number = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
      const preview = stops.slice(0, 3).map(s => s.startTime ? `${s.startTime} ${s.title}` : s.title).join(" · ");
      const body = stops.length ? `${preview}${stops.length > 3 ? ` · +${stops.length - 3} more` : ""}` : "Your day is open. Add a stop or ask the assistant for ideas.";
      queued += await prisma.$transaction(tx => queuePush(tx, {
        userIds, tripId: trip.id, category: "reminders", dedupeKey: `reminder:day:${trip.id}:${today}`,
        title: `Day ${number}${day?.title ? ` · ${day.title}` : ""}`, body, href: `/trips/${trip.id}/itinerary`,
      }));
    }
  }
  return queued;
}

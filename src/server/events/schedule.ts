import { addDays, daysBetween, todayIn, zonedToUtc } from "@/lib/dates";
import { prisma } from "@/server/db";
import { aiConfigured, webSearchEnabled } from "@/server/ai/openai";
import { getTripPlan } from "@/server/plans/access";
import { currentRuntime } from "@/server/cloudflare/runtime";

type Dates = { startDate: string | null; endDate: string | null; timezone: string };
/** Automatic searches run weekly (Mondays) until two weeks before departure,
 * then every third day (14, 11, 8, 5 and 2 days before), and stop when the trip
 * starts. Travellers can still refresh events themselves at any time. */
export const FINAL_WINDOW_DAYS = 14;
export function automaticSearchDay(date: string, startDate: string) {
  const remaining = daysBetween(date, startDate);
  if (remaining <= 0) return false;
  if (remaining <= FINAL_WINDOW_DAYS) return remaining % 3 === FINAL_WINDOW_DAYS % 3;
  return new Date(`${date}T12:00:00Z`).getUTCDay() === 1;
}
export function discoveryCadence(trip: Dates, now = new Date()) {
  if (!trip.startDate || !trip.endDate) return "Add dates to start automatic searches";
  const today = todayIn(trip.timezone, now);
  if (trip.endDate < today) return "Trip ended · automatic searches stopped";
  if (trip.startDate <= today) return "Paused during the trip · refresh events any time";
  return daysBetween(today, trip.startDate) > FINAL_WINDOW_DAYS ? "Weekly · Mondays" : "Every 3 days until the trip starts";
}
/** First permitted local 09:00 after the last check, recalculating the cadence
 * on EACH date so the switch to every third day never waits for an old slot.
 */
export function nextDiscoveryAt(trip: Dates, after: Date): Date | null {
  if (!trip.startDate || !trip.endDate) return null;
  let date = todayIn(trip.timezone, after);
  for (let i = 0; i < 14 && date < trip.startDate; i++, date = addDays(date, 1)) {
    if (!automaticSearchDay(date, trip.startDate)) continue;
    const slot = zonedToUtc(`${date}T09:00`, trip.timezone);
    if (slot > after) return slot;
  }
  return null;
}
export async function queueDueDiscoveries(now = new Date()) {
  if (!aiConfigured() || !webSearchEnabled()) return 0;
  // Automatic searches stop when a trip starts. Trips that started more than two
  // days ago (any time zone) are never due again, so the hourly scan skips them.
  const started = addDays(now.toISOString().slice(0, 10), -2);
  const trips = await prisma.trip.findMany({ where: { autoDiscovery: true, startDate: { not: null, gte: started }, endDate: { not: null } }, include: { destinations: { select: { id: true } } } });
  let queued = 0;
  for (const trip of trips) {
    const today = todayIn(trip.timezone, now);
    const plan = await getTripPlan(trip.id);
    if (!plan.premium || plan.preview || trip.startDate! <= today || !trip.destinations.length || !["COMPLETE", "GENERATING"].includes(trip.onboardingStage)) {
      if (trip.nextDiscoveryAt) await prisma.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: null } });
      continue;
    }
    if (await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, status: { in: ["queued", "running"] } } })) continue;
    const success = await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, status: "succeeded" }, orderBy: { finishedAt: "desc" } });
    const failed = await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, trigger: "scheduled", status: "failed" }, orderBy: { finishedAt: "desc" } });
    let due = success?.finishedAt ? nextDiscoveryAt(trip, success.finishedAt) : now;
    if (due && failed?.finishedAt && (!success?.finishedAt || failed.finishedAt > success.finishedAt)) due = new Date(Math.max(due.getTime(), failed.finishedAt.getTime() + 6 * 3600_000));
    if (due && todayIn(trip.timezone, due) >= trip.startDate!) due = null;
    await prisma.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: due } });
    if (!due || due > now) continue;
    // HTTP maintenance owns the application lock; insert and advance together.
    await prisma.$transaction(async tx => {
      if (await tx.discoveryRun.findFirst({ where: { tripId: trip.id, status: { in: ["queued", "running"] } } })) return;
      await tx.discoveryRun.create({ data: { tripId: trip.id, trigger: "scheduled", requestedById: trip.ownerId } });
      await tx.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: nextDiscoveryAt(trip, now) } });
      queued++;
    });
  }
  if (queued) await currentRuntime().wakeAi?.();
  return queued;
}

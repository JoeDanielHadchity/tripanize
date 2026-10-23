import { addDays, daysBetween, todayIn, zonedToUtc } from "@/lib/dates";
import { prisma } from "@/server/db";
import { aiConfigured, webSearchEnabled } from "@/server/ai/openai";
import { getTripPlan } from "@/server/plans/access";
import { currentRuntime } from "@/server/cloudflare/runtime";

type Dates = { startDate: string | null; endDate: string | null; timezone: string };
export function discoveryCadence(trip: Dates, now = new Date()) {
  if (!trip.startDate || !trip.endDate) return "Add dates to start automatic searches";
  const today = todayIn(trip.timezone, now);
  if (trip.endDate < today) return "Trip ended · automatic searches stopped";
  const days = daysBetween(today, trip.startDate);
  return days >= 30 ? "Weekly · Mondays" : days > 14 ? "Mondays & Thursdays" : "Daily · through the end of your trip";
}
/** First permitted local 09:00 after the last check, recalculating the cadence
 * on EACH date so a transition to twice-weekly/daily never waits for an old slot.
 */
export function nextDiscoveryAt(trip: Dates, after: Date): Date | null {
  if (!trip.startDate || !trip.endDate) return null;
  let date = todayIn(trip.timezone, after);
  for (let i = 0; i < 14 && date <= trip.endDate; i++, date = addDays(date, 1)) {
    const remaining = daysBetween(date, trip.startDate);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (!(remaining <= 14 || (remaining < 30 ? weekday === 1 || weekday === 4 : weekday === 1))) continue;
    const slot = zonedToUtc(`${date}T09:00`, trip.timezone);
    if (slot > after) return slot;
  }
  return null;
}
export async function queueDueDiscoveries(now = new Date()) {
  if (!aiConfigured() || !webSearchEnabled()) return 0;
  const trips = await prisma.trip.findMany({ where: { autoDiscovery: true, startDate: { not: null }, endDate: { not: null } }, include: { destinations: { select: { id: true } } } });
  let queued = 0;
  for (const trip of trips) {
    const today = todayIn(trip.timezone, now);
    const plan = await getTripPlan(trip.id);
    if (!plan.premium || plan.preview || trip.endDate! < today || !trip.destinations.length || !["COMPLETE", "GENERATING"].includes(trip.onboardingStage)) {
      if (trip.nextDiscoveryAt) await prisma.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: null } });
      continue;
    }
    if (await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, status: { in: ["queued", "running"] } } })) continue;
    const success = await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, status: "succeeded" }, orderBy: { finishedAt: "desc" } });
    const failed = await prisma.discoveryRun.findFirst({ where: { tripId: trip.id, trigger: "scheduled", status: "failed" }, orderBy: { finishedAt: "desc" } });
    let due = success?.finishedAt ? nextDiscoveryAt(trip, success.finishedAt) : now;
    if (due && failed?.finishedAt && (!success?.finishedAt || failed.finishedAt > success.finishedAt)) due = new Date(Math.max(due.getTime(), failed.finishedAt.getTime() + 6 * 3600_000));
    if (due && todayIn(trip.timezone, due) > trip.endDate!) due = null;
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

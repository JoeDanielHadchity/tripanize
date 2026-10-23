import { nextDiscoveryAt } from "./schedule";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requirePremiumTrip, requirePremiumAccess } from "@/server/plans/access";
import { rateLimit } from "@/server/ratelimit";
import { AIError, aiConfigured, generateStructured } from "@/server/ai/openai";
import { EVENTS_INSTRUCTIONS } from "@/server/planner/prompt";
import { EventsSchema } from "@/server/planner/schema";
import { isDateStr, isTimeStr, todayIn } from "@/lib/dates";
import { upsertDiscoveredEvents } from "./service";
import { queueEventNotifications } from "@/server/notifications/events";
import { currentRuntime } from "@/server/cloudflare/runtime";

export async function requestDiscovery(userId: string, tripId: string) {
  await requirePremiumTrip(tripId, userId, "events", "edit");
  if (!aiConfigured()) throw new AppError("NOT_CONFIGURED", "Event discovery uses OpenAI web search, which isn't configured on this server (OPENAI_API_KEY missing). You can still add events yourself.");
  const active = await prisma.discoveryRun.findFirst({ where: { tripId, status: { in: ["queued", "running"] } } });
  if (active) { await currentRuntime().wakeAi?.(); return active; }
  await rateLimit(`discover:${userId}`, 10, 3600, "You've refreshed events a lot recently. Please try again later.");
  const run = await prisma.discoveryRun.create({ data: { tripId, trigger: "manual", requestedById: userId } });
  await currentRuntime().wakeAi?.();
  return run;
}

/** Performs one discovery run (called by the worker). New results only enter the shortlist. */
export async function runDiscovery(runId: string, generate = generateStructured) {
  const claimed = await prisma.discoveryRun.updateMany({ where: { id: runId, status: "queued" }, data: { status: "running", startedAt: new Date() } });
  if (!claimed.count) return;
  const run = await prisma.discoveryRun.findUniqueOrThrow({ where: { id: runId } });
  try {
    await requirePremiumAccess(run.tripId, "events");
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: run.tripId }, include: { destinations: { orderBy: { position: "asc" } } } });
    if (run.trigger === "scheduled" && !trip.autoDiscovery) throw new AppError("CONFLICT", "Automatic event discovery is paused.");
    if (!trip.startDate || !trip.endDate || !trip.destinations.length) throw new AIError("INVALID_RESPONSE", "Add trip dates and at least one destination to discover events.");
    if (trip.endDate < todayIn(trip.timezone)) throw new AIError("INVALID_RESPONSE", "This trip is in the past; no new events are searched.");
    const known = await prisma.tripEvent.findMany({ where: { tripId: trip.id }, select: { title: true, date: true, venue: true } });
    const data = {
      destinations: trip.destinations.map((d) => ({ city: d.name, country: d.country, from: d.arriveDate ?? trip.startDate, to: d.departDate ?? trip.endDate })),
      today: todayIn(trip.timezone),
      interests: trip.interests, pace: trip.pace, preferences: trip.preferences, answers: trip.planPrefs,
      accessibility: trip.accessibility, dietary: trip.dietary, notes: trip.notes, budgetMinor: trip.budgetMinor, currency: trip.currency,
      travelers: { adults: trip.adults, children: trip.children },
      knownEvents: known.slice(0, 40),
      instruction: "Use the saved preferences and questionnaire answers to find genuinely matching events. Explain why each fits. Exclude unsuitable events rather than filling a quota. Re-check known events for changes (date, venue, cancellation, sold out, booking opening, price) and add new relevant ones.",
    };
    const res = await generate({ schema: EventsSchema, name: "events", instructions: EVENTS_INSTRUCTIONS, input: `<trip_data>\n${JSON.stringify(data, null, 1)}\n</trip_data>`, webSearch: true, timeoutMs: 4 * 60_000, maxOutputTokens: 16000 });
    await requirePremiumAccess(run.tripId, "events");
    const inWindow = res.data.events.filter((e) => {
      if (e.date && !isDateStr(e.date)) e.date = null;
      if (e.endDate && !isDateStr(e.endDate)) e.endDate = null;
      if (e.startTime && !isTimeStr(e.startTime)) e.startTime = null;
      const start = e.date;
      const end = e.endDate ?? e.date;
      // Undated events are kept only with explicit uncertainty; dated ones must overlap the trip.
      return start ? start <= trip.endDate! && (end ?? start) >= trip.startDate! : Boolean(e.uncertainty);
    });
    await prisma.$transaction(async tx => {
      await requirePremiumAccess(run.tripId, "events", tx);
      const current = await tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      if ((run.trigger === "scheduled" && !current.autoDiscovery) || current.version !== trip.version || JSON.stringify(current.planPrefs) !== JSON.stringify(trip.planPrefs)) throw new AppError("CONFLICT", "Trip details or preferences changed during this search. The next check will use the latest choices.");
      const result = await upsertDiscoveredEvents(
        trip.id,
        inWindow.map((e) => ({
          title: e.title.slice(0, 160), category: e.category, date: e.date, startTime: e.startTime, endDate: e.endDate, dateVerified: e.dateVerified,
          venue: e.venue?.slice(0, 160) ?? null, city: e.city.slice(0, 120), address: e.address?.slice(0, 300) ?? null, officialUrl: e.officialUrl, bookingUrl: e.bookingUrl,
          priceText: e.priceText?.slice(0, 80) ?? null, availability: e.availability?.slice(0, 120) ?? null, bookingDeadline: e.bookingDeadline?.slice(0, 80) ?? null,
          whyFits: e.whyFits.slice(0, 400), uncertainty: e.uncertainty?.slice(0, 400) ?? null, cancelled: e.cancelled, soldOut: e.soldOut, sources: e.sources,
        })), tx,
      );
      await queueEventNotifications(tx, trip.id, runId, result.newEvents, result.changedEvents);
      await tx.trip.update({ where: { id: trip.id }, data: { nextDiscoveryAt: current.autoDiscovery ? nextDiscoveryAt(current, new Date()) : null } });
      await tx.discoveryRun.update({ where: { id: runId }, data: { status: "succeeded", finishedAt: new Date(), found: inWindow.length, added: result.added, changed: result.changed } });
    }, { timeout: 30000 });
  } catch (err) {
    const msg = err instanceof AIError || err instanceof AppError ? err.message : "Unexpected error during event discovery.";
    if (!(err instanceof AIError)) console.error("[discovery]", err instanceof Error ? err.message : err);
    await prisma.discoveryRun.update({ where: { id: runId }, data: { status: "failed", finishedAt: new Date(), error: msg } });
    if (run.trigger === "scheduled") await prisma.trip.updateMany({ where: { id: run.tripId, autoDiscovery: true }, data: { nextDiscoveryAt: new Date(Date.now() + 6 * 3600_000) } });
  }
}

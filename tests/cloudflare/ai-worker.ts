import { queueDueDiscoveries } from "../../src/server/events/schedule";
import { requestDiscovery } from "../../src/server/events/discovery";
import eventAlerts from "../../prisma/migrations/202610230012_event_alerts/migration.sql";
import { fixtureIdeas } from "../fixtures/destinations";
import { startDestinationSearch, getDestinationSearch, chooseDestination } from "../../src/server/destinations/service";
import destinationSearch from "../../prisma/migrations/202610230011_destination_search/migration.sql";
import { DurableObject } from "cloudflare:workers";
import schema from "../../prisma/migrations/202610220001_cloudflare_initial/migration.sql";
import eventBookings from "../../prisma/migrations/202610220002_event_bookings/migration.sql";
import tripNotifications from "../../prisma/migrations/202610220003_trip_notifications/migration.sql";
import memberLocations from "../../prisma/migrations/202610220004_member_locations/migration.sql";
import tripChat from "../../prisma/migrations/202610220005_trip_chat/migration.sql";
import expenseReceipts from "../../prisma/migrations/202610220006_expense_receipts/migration.sql";
import tripPurchases from "../../prisma/migrations/202610220008_trip_purchases/migration.sql";
import planAccess from "../../prisma/migrations/202610220007_plan_access/migration.sql";
import guidedSetup from "../../prisma/migrations/202610230010_guided_setup/migration.sql";
import tripFeatures from "../../prisma/migrations/202610230009_trip_features/migration.sql";
import { changeMemberLocation, getLocationSelf } from "../../src/server/locations/service";
import { createDatabase } from "../../src/server/db";
import { DurableSqliteAdapter } from "../../src/server/cloudflare/sqlite-adapter";
import { appRuntime } from "../../src/server/cloudflare/runtime";
import { AiTasks } from "../../src/server/cloudflare/ai-tasks";
import { createTripDraft, saveOnboardingDetails, startOnboardingPlan } from "../../src/server/trips/onboarding";
import { createTrip } from "../../src/server/trips/service";
import { enqueueJob, cancelJob } from "../../src/server/planner/jobs";
import { getPlanQuestions, STANDARD_QUESTIONS } from "../../src/server/planner/questions";
import type { Generator, PlanCheckpoint } from "../../src/server/planner/run";
import { recordChange } from "../../src/server/audit";
import { sendNextChangeEmail } from "../../src/server/notifications/changes";
import { sendAssistantMessage, getAssistantConversation, applyAssistantChanges } from "../../src/server/assistant/service";
import { addStop } from "../../src/server/itinerary/service";

interface Env { PROBE: DurableObjectNamespace }
export class AiProbe extends DurableObject<Env> {
  private db = createDatabase(new DurableSqliteAdapter(this.ctx.storage));
  private pending: Promise<unknown> = Promise.resolve();
  private serialize<T>(run: () => Promise<T>) {
    const result = this.pending.then(run, run);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
  private generate = (async (opts: { name: string; input: string }) => {
    if (opts.name === "destination_ideas") {
      await new Promise(resolve => setTimeout(resolve, 1200));
      return { data: fixtureIdeas(), model: "isolated-stub", sources: ["https://example.test/tourism"], usage: null };
    }
    const data = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]);
    await this.serialize(async () => {
      const calls = await this.ctx.storage.get<string[][]>("calls") ?? [];
      await this.ctx.storage.put("calls", [...calls, data.datesToPlan ?? [opts.name === "trip_assistant" ? "assistant" : "questions"]]);
    });
    await new Promise(resolve => setTimeout(resolve, 1200));
    if (opts.name === "events") return { model: "isolated-stub", sources: ["https://example.test/event"], usage: null, data: { events: data.destinations[0].city === "Scheduled events fixture" ? [{ title: "Native local culture evening", category: "cultural", date: data.destinations[0].from, endDate: null, startTime: "18:00", dateVerified: true, venue: "Fixture venue", city: "Scheduled events fixture", address: null, officialUrl: "https://example.test/event", bookingUrl: "https://example.test/tickets", priceText: "Free", availability: "Available", bookingDeadline: null, cancelled: false, soldOut: false, whyFits: "Local culture preference", uncertainty: null, sources: [{ url: "https://example.test/event", title: "Fixture source" }] }] : [] } };
    if (opts.name === "trip_packing") return { model: "isolated-stub", sources: [], usage: null, data: { items: [{ label: "Custom weather layer", category: "Clothing", reason: "Test fixture for this destination and season", shared: false, quantity: 1 }] } };
    return { model: "isolated-stub", sources: ["https://example.test/source"], usage: null, data: opts.name === "trip_assistant" ? { reply: "Proposed day swap", edits: [{ type: "swap_days", date: data.trip.days[1].date, otherDate: data.trip.days[2].date }] } : opts.name === "plan_questions" ? { questions: STANDARD_QUESTIONS } : {
      summary: "Local test draft", generalNotes: [], unplacedMustSees: [],
      days: data.datesToPlan.map((date: string) => ({ date, area: "Lisbon", title: "Explore", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null })),
    } };
  }) as Generator;
  private tasks: AiTasks = new AiTasks(this.ctx.storage, () => ({ database: this.db, authSecret: "isolated-ai-test", planAccessEnabled: true, wakeAi: (): Promise<void> => this.tasks.wake(), wakeNotifications: (): Promise<void> => this.tasks.wake() }), run => this.serialize(run), this.generate, () => sendNextChangeEmail(async msg => {
    const attempt = await this.serialize(async () => {
      const attempts = await this.ctx.storage.get<string[]>("emailAttempts") ?? [];
      await this.ctx.storage.put("emailAttempts", [...attempts, msg.idempotencyKey!]);
      return attempts.length + 1;
    });
    return attempt === 1 ? { status: "failed", error: "Synthetic transient failure", retryable: true } : { status: "sent", providerId: "synthetic-provider-id" };
  }));
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      if (!await ctx.storage.get("ready")) { ctx.storage.transactionSync(() => ctx.storage.sql.exec(schema)); await ctx.storage.put("ready", true); }
      ctx.storage.transactionSync(() => {
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Booking")').toArray().some(column => column.name === "eventId")) ctx.storage.sql.exec(eventBookings);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("NotificationPreference")').toArray().some(column => column.name === "changeEmailEnabled")) ctx.storage.sql.exec(tripNotifications);
        ctx.storage.sql.exec(memberLocations);
        ctx.storage.sql.exec(destinationSearch);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "chatSeq")) ctx.storage.sql.exec(tripChat);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Attachment")').toArray().some(column => column.name === "expenseId")) ctx.storage.sql.exec(expenseReceipts);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "normalAiDates")) ctx.storage.sql.exec(planAccess);
        ctx.storage.sql.exec(tripPurchases);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "selectedPremiumFeatures")) ctx.storage.sql.exec(tripFeatures);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "onboardingStage")) ctx.storage.sql.exec(guidedSetup);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("TripNotification")').toArray().some(c => c.name === "kind")) ctx.storage.sql.exec(eventAlerts);
      });
      if (await this.tasks.pending()) await this.tasks.wake();
    });
  }
  async alarm() { await this.tasks.alarm(); }
  async fetch(request: Request) {
    return this.serialize(() => appRuntime.run({ database: this.db, authSecret: "isolated-ai-test", planAccessEnabled: true, wakeAi: () => this.tasks.wake(), wakeNotifications: () => this.tasks.wake() }, async () => {
      try {
        const url = new URL(request.url);
        if (url.pathname === "/start") {
          const id = crypto.randomUUID();
          const owner = await this.db.user.create({ data: { id, name: "AI fixture", email: `${id}@example.test` } });
          const tripId = await createTrip(owner.id, { name: "Durable AI fixture", startDate: "2020-05-01", endDate: "2020-05-06", timezone: "Europe/Lisbon", currency: "EUR", destinations: [{ name: "Lisbon" }], travelers: [], interests: [] });
          await this.db.premiumCheckout.create({ data: { tripId, buyerId: owner.id, environment: "live", priceId: "isolated", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
          await this.db.destination.updateMany({ where: { tripId }, data: { lat: 38.7, lng: -9.1 } });
          await this.ctx.storage.put("fixture", { ownerId: owner.id, tripId });
          const job = await enqueueJob(owner.id, tripId, "full", {});
          const duplicate = await enqueueJob(owner.id, tripId, "full", {});
          return Response.json({ ...job, duplicateJobId: duplicate.jobId });
        }
        const fixture = await this.ctx.storage.get<{ ownerId: string; tripId: string }>("fixture");
        if (!fixture) return Response.json({ error: "Start first" }, { status: 400 });
        if (url.pathname === "/events/start") {
          process.env.OPENAI_API_KEY = "isolated-native-fixture-key"; process.env.OPENAI_WEB_SEARCH = "true";
          const tripId = await createTrip(fixture.ownerId, { name: "Scheduled event fixture", startDate: "2030-06-15", endDate: "2030-06-20", destinations: [{ name: "Scheduled events fixture" }], interests: ["Local culture"] });
          await this.db.premiumCheckout.create({ data: { tripId, buyerId: fixture.ownerId, environment: "live", priceId: "fixture", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
          await this.db.user.update({ where: { id: fixture.ownerId }, data: { emailVerified: true } });
          await this.db.notificationPreference.update({ where: { userId_tripId: { userId: fixture.ownerId, tripId } }, data: { emailEnabled: true, changeTypes: ["new"] } });
          await this.ctx.storage.put("event-fixture", tripId);
          return Response.json({ queued: await queueDueDiscoveries(), duplicate: await queueDueDiscoveries() });
        }
        if (url.pathname === "/events/state") {
          const tripId = (await this.ctx.storage.get<string>("event-fixture"))!;
          return Response.json({ runs: await this.db.discoveryRun.findMany({ where: { tripId }, select: { status: true, trigger: true } }), notices: await this.db.tripNotification.findMany({ where: { tripId }, select: { kind: true, summary: true, emailStatus: true } }), stops: await this.db.stop.count({ where: { tripId } }) });
        }
        if (url.pathname === "/events/again") return Response.json(await requestDiscovery(fixture.ownerId, (await this.ctx.storage.get<string>("event-fixture"))!));
        if (url.pathname === "/destinations/start") {
          process.env.OPENAI_API_KEY = "isolated-native-fixture-key";
          const search = await startDestinationSearch(fixture.ownerId, { departureCity: "Beirut, Lebanon", timing: "flexible", days: 7, adults: 2, children: 0, budget: 1500, climate: "Mild & comfortable", interests: ["History & culture"], pace: "RELAXED", distance: "Up to 6 hours", crowds: "A balance" });
          await this.ctx.storage.put("destination-fixture", search.id);
          return Response.json(search);
        }
        if (url.pathname === "/destinations/state") return Response.json(await getDestinationSearch(fixture.ownerId, (await this.ctx.storage.get<string>("destination-fixture"))!));
        if (url.pathname === "/destinations/choose") return Response.json(await chooseDestination(fixture.ownerId, (await this.ctx.storage.get<string>("destination-fixture"))!, 0));
        if (url.pathname === "/assistant/start") {
          const days = await this.db.itineraryDay.findMany({ where: { tripId: fixture.tripId }, orderBy: { date: "asc" } });
          await addStop(fixture.ownerId, fixture.tripId, { dayId: days[1].id, input: { title: "Assistant museum", startTime: "10:00", durationMin: 60 } });
          await addStop(fixture.ownerId, fixture.tripId, { dayId: days[2].id, input: { title: "Assistant park", startTime: "11:00", durationMin: 45 } });
          const input = { clientId: crypto.randomUUID(), message: "Swap days 2 and 3", selectedDate: days[1].date };
          const queued = await sendAssistantMessage(fixture.ownerId, fixture.tripId, input);
          const duplicate = await sendAssistantMessage(fixture.ownerId, fixture.tripId, input);
          return Response.json({ id: queued.id, duplicateId: duplicate.id });
        }
        if (url.pathname === "/assistant/state") return Response.json({ conversation: await getAssistantConversation(fixture.ownerId, fixture.tripId), days: await this.db.itineraryDay.findMany({ where: { tripId: fixture.tripId }, orderBy: { date: "asc" }, select: { date: true, stops: { select: { title: true } } } }) });
        if (url.pathname === "/assistant/apply") {
          const c = await getAssistantConversation(fixture.ownerId, fixture.tripId);
          return Response.json(await applyAssistantChanges(fixture.ownerId, fixture.tripId, c.latestId!));
        }
        if (url.pathname === "/locations/start") {
          await changeMemberLocation(fixture.ownerId, fixture.tripId, { op: "start", scope: (await getLocationSelf(fixture.ownerId, fixture.tripId)).scope, token: "isolated-location-lease-01234567890123456789", expectedVersion: 0, lat: 38.7, lng: -9.1, accuracy: 20, capturedAt: new Date().toISOString() });
          await this.db.memberLocation.updateMany({ data: { expiresAt: new Date(Date.now() + 3000) } });
          await this.tasks.wake();
          return Response.json({ shared: true });
        }
        if (url.pathname === "/onboarding/start") {
          const { id: tripId } = await createTripDraft(fixture.ownerId, "Native guided trip");
          await this.db.premiumCheckout.create({ data: { tripId, buyerId: fixture.ownerId, environment: "live", priceId: "isolated", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
          await this.db.trip.update({ where: { id: tripId }, data: { onboardingStage: "DETAILS", onboardingPlan: "PREMIUM" } });
          await saveOnboardingDetails(fixture.ownerId, tripId, { name: "Native guided trip", startDate: "2030-05-01", endDate: "2030-05-02", destinations: [{ name: "Native fixture" }] }, 1);
          await this.ctx.storage.put("onboarding-fixture", tripId);
          return Response.json({ tripId });
        }
        if (url.pathname === "/onboarding/answers") {
          const tripId = (await this.ctx.storage.get<string>("onboarding-fixture"))!;
          return Response.json(await startOnboardingPlan(fixture.ownerId, tripId, { answers: STANDARD_QUESTIONS.map(q => ({ q: q.q, a: [q.options[0]] })), note: null }));
        }
        if (url.pathname === "/onboarding/state") {
          const tripId = (await this.ctx.storage.get<string>("onboarding-fixture"))!;
          const trip = await this.db.trip.findUniqueOrThrow({ where: { id: tripId } });
          const jobs = await this.db.generationJob.findMany({ where: { tripId }, select: { kind: true, status: true, appliedAt: true } });
          return Response.json({ stage: trip.onboardingStage, jobs, packing: await this.db.packingItem.count({ where: { tripId } }) });
        }
        if (url.pathname === "/locations/state") return Response.json(await this.db.memberLocation.findMany({ select: { lat: true, leaseHash: true, expiresAt: true } }));
        if (url.pathname === "/notifications/start") {
          const id = crypto.randomUUID();
          await this.db.user.create({ data: { id, name: "Notification recipient", email: `${id}@example.test`, emailVerified: true } });
          await this.db.tripMembership.create({ data: { tripId: fixture.tripId, userId: id, role: "VIEWER" } });
          await this.db.notificationPreference.create({ data: { tripId: fixture.tripId, userId: id, changeEmailEnabled: true } });
          await this.db.$transaction(tx => recordChange(tx, { tripId: fixture.tripId, actorId: fixture.ownerId, entity: "trip", entityId: fixture.tripId, action: "update" }));
          return Response.json({ queued: true });
        }
        if (url.pathname === "/notifications/retry") {
          await this.db.tripNotification.updateMany({ where: { emailStatus: "queued" }, data: { nextAttemptAt: new Date(Date.now() + 3000) } });
          await this.tasks.wake();
          return Response.json({ retryReady: true });
        }
        if (url.pathname === "/questions") return Response.json(await getPlanQuestions(fixture.ownerId, fixture.tripId, { poll: url.searchParams.has("poll") }));
        if (url.pathname === "/cancel") {
          const job = await enqueueJob(fixture.ownerId, fixture.tripId, "full", {});
          await cancelJob(fixture.ownerId, fixture.tripId, job.jobId);
          return Response.json(job);
        }
        if (url.pathname === "/transaction") {
          try { await this.db.$transaction(async tx => { await tx.trip.update({ where: { id: fixture.tripId }, data: { name: "Must roll back" } }); await new Promise(resolve => setTimeout(resolve, 100)); throw new Error("rollback"); }); } catch { /* expected */ }
        }
        const jobs = await this.db.generationJob.findMany({ where: { tripId: fixture.tripId }, orderBy: { createdAt: "asc" } });
        const checkpoints = await this.ctx.storage.list<PlanCheckpoint>({ prefix: "ai-checkpoint:" });
        return Response.json({ jobs: jobs.map(job => ({ id: job.id, status: job.status, kind: job.kind, days: (job.proposal as unknown as { days?: unknown[] })?.days?.length ?? 0 })), calls: await this.ctx.storage.get("calls") ?? [], checkpointDays: [...checkpoints.values()][0]?.completedDates.length ?? 0, name: (await this.db.trip.findUniqueOrThrow({ where: { id: fixture.tripId } })).name, itineraryStops: await this.db.stop.count({ where: { tripId: fixture.tripId } }), notifications: await this.db.tripNotification.findMany({ select: { emailStatus: true, attempts: true } }), emailAttempts: await this.ctx.storage.get("emailAttempts") ?? [] });
      } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Test failed" }, { status: 500 }); }
    }));
  }
}
export default { fetch(request: Request, env: Env) { return env.PROBE.getByName("ai-fixture").fetch(request); } };

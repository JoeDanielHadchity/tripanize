import { DurableObject } from "cloudflare:workers";
import schema from "../../prisma/migrations/202610220001_cloudflare_initial/migration.sql";
import eventBookings from "../../prisma/migrations/202610220002_event_bookings/migration.sql";
import tripNotifications from "../../prisma/migrations/202610220003_trip_notifications/migration.sql";
import { createDatabase } from "../../src/server/db";
import { DurableSqliteAdapter } from "../../src/server/cloudflare/sqlite-adapter";
import { appRuntime } from "../../src/server/cloudflare/runtime";
import { AiTasks } from "../../src/server/cloudflare/ai-tasks";
import { createTrip } from "../../src/server/trips/service";
import { enqueueJob, cancelJob } from "../../src/server/planner/jobs";
import { getPlanQuestions, STANDARD_QUESTIONS } from "../../src/server/planner/questions";
import type { Generator, PlanCheckpoint } from "../../src/server/planner/run";
import { recordChange } from "../../src/server/audit";
import { sendNextChangeEmail } from "../../src/server/notifications/changes";

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
    const data = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]);
    await this.serialize(async () => {
      const calls = await this.ctx.storage.get<string[][]>("calls") ?? [];
      await this.ctx.storage.put("calls", [...calls, data.datesToPlan ?? ["questions"]]);
    });
    await new Promise(resolve => setTimeout(resolve, 1200));
    return { model: "isolated-stub", sources: ["https://example.test/source"], usage: null, data: opts.name === "plan_questions" ? { questions: STANDARD_QUESTIONS } : {
      summary: "Local test draft", generalNotes: [], unplacedMustSees: [],
      days: data.datesToPlan.map((date: string) => ({ date, area: "Lisbon", title: "Explore", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null })),
    } };
  }) as Generator;
  private tasks: AiTasks = new AiTasks(this.ctx.storage, () => ({ database: this.db, authSecret: "isolated-ai-test", wakeAi: (): Promise<void> => this.tasks.wake(), wakeNotifications: (): Promise<void> => this.tasks.wake() }), run => this.serialize(run), this.generate, () => sendNextChangeEmail(async msg => {
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
      });
      if (await this.tasks.pending()) await this.tasks.wake();
    });
  }
  async alarm() { await this.tasks.alarm(); }
  async fetch(request: Request) {
    return this.serialize(() => appRuntime.run({ database: this.db, authSecret: "isolated-ai-test", wakeAi: () => this.tasks.wake(), wakeNotifications: () => this.tasks.wake() }, async () => {
      try {
        const url = new URL(request.url);
        if (url.pathname === "/start") {
          const id = crypto.randomUUID();
          const owner = await this.db.user.create({ data: { id, name: "AI fixture", email: `${id}@example.test` } });
          const tripId = await createTrip(owner.id, { name: "Durable AI fixture", startDate: "2020-05-01", endDate: "2020-05-06", timezone: "Europe/Lisbon", currency: "EUR", destinations: [{ name: "Lisbon" }], travelers: [], interests: [] });
          await this.db.destination.updateMany({ where: { tripId }, data: { lat: 38.7, lng: -9.1 } });
          await this.ctx.storage.put("fixture", { ownerId: owner.id, tripId });
          const job = await enqueueJob(owner.id, tripId, "full", {});
          const duplicate = await enqueueJob(owner.id, tripId, "full", {});
          return Response.json({ ...job, duplicateJobId: duplicate.jobId });
        }
        const fixture = await this.ctx.storage.get<{ ownerId: string; tripId: string }>("fixture");
        if (!fixture) return Response.json({ error: "Start first" }, { status: 400 });
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

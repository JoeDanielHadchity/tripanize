import { normalizeCompanyIdentity } from "../src/server/admin/identity";
import companyTrials from "../prisma/migrations/202610230013_company_trials/migration.sql?raw";
import { queueDueDiscoveries } from "../src/server/events/schedule";
import eventAlerts from "../prisma/migrations/202610230012_event_alerts/migration.sql?raw";
import destinationSearch from "../prisma/migrations/202610230011_destination_search/migration.sql?raw";
import { DurableObject } from "cloudflare:workers";
import handler from "vinext/server/app-router-entry";
import schema from "../prisma/migrations/202610220001_cloudflare_initial/migration.sql?raw";
import eventBookings from "../prisma/migrations/202610220002_event_bookings/migration.sql?raw";
import tripNotifications from "../prisma/migrations/202610220003_trip_notifications/migration.sql?raw";
import memberLocations from "../prisma/migrations/202610220004_member_locations/migration.sql?raw";
import tripChat from "../prisma/migrations/202610220005_trip_chat/migration.sql?raw";
import expenseReceipts from "../prisma/migrations/202610220006_expense_receipts/migration.sql?raw";
import tripPurchases from "../prisma/migrations/202610220008_trip_purchases/migration.sql?raw";
import planAccess from "../prisma/migrations/202610220007_plan_access/migration.sql?raw";
import guidedSetup from "../prisma/migrations/202610230010_guided_setup/migration.sql?raw";
import tripFeatures from "../prisma/migrations/202610230009_trip_features/migration.sql?raw";
import { expireMemberLocations } from "../src/server/locations/service";
import { createDatabase } from "../src/server/db";
import { paddleConfigFromEnv } from "../src/server/billing/config";
import { appRuntime } from "../src/server/cloudflare/runtime";
import { DurableSqliteAdapter } from "../src/server/cloudflare/sqlite-adapter";
import { AiTasks } from "../src/server/cloudflare/ai-tasks";
import { serializedDatabase } from "../src/server/cloudflare/serialized-db";

/** Serialize application requests so relational transactions remain isolated.
 * Buffer each response before releasing the queue: streamed server components
 * must finish their database work before the next request starts a transaction.
 */
export class TripanizeApp extends DurableObject<CloudflareEnv> {
  private database = createDatabase(new DurableSqliteAdapter(this.ctx.storage));
  private pending: Promise<unknown> = Promise.resolve();
  private secret = "";
  private ready: Promise<void>;
  private aiTasks: AiTasks = new AiTasks(this.ctx.storage, () => this.runtime(), (run) => this.serialize(run));
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const version = await ctx.storage.get<number>("schemaVersion") ?? 0;
      if (version < 1) {
        ctx.storage.transactionSync(() => ctx.storage.sql.exec(schema));
        await ctx.storage.put("schemaVersion", 1);
      }
      if (version < 2) {
        // Recover safely if SQL committed before a restart interrupted the marker.
        ctx.storage.transactionSync(() => {
          const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Booking")').toArray();
          if (!columns.some(column => column.name === "eventId")) ctx.storage.sql.exec(eventBookings);
        });
        await ctx.storage.put("schemaVersion", 2);
      }
      if (version < 3) {
        ctx.storage.transactionSync(() => {
          const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("NotificationPreference")').toArray();
          if (!columns.some(column => column.name === "changeEmailEnabled")) ctx.storage.sql.exec(tripNotifications);
        });
        await ctx.storage.put("schemaVersion", 3);
      }
      if (version < 4) {
        ctx.storage.transactionSync(() => ctx.storage.sql.exec(memberLocations));
        await ctx.storage.put("schemaVersion", 4);
      }
      if (version < 5) {
        ctx.storage.transactionSync(() => {
          const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray();
          if (!columns.some(column => column.name === "chatSeq")) ctx.storage.sql.exec(tripChat);
        });
        await ctx.storage.put("schemaVersion", 5);
      }
      if (version < 6) {
        ctx.storage.transactionSync(() => {
          const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Attachment")').toArray();
          if (!columns.some(column => column.name === "expenseId")) ctx.storage.sql.exec(expenseReceipts);
        });
        await ctx.storage.put("schemaVersion", 6);
      }
      if (version < 7) {
        ctx.storage.transactionSync(() => {
          const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray();
          if (!columns.some(column => column.name === "normalAiDates")) ctx.storage.sql.exec(planAccess);
        });
        await ctx.storage.put("schemaVersion", 7);
      }
      if (version < 8) {
        ctx.storage.transactionSync(() => ctx.storage.sql.exec(tripPurchases));
        await ctx.storage.put("schemaVersion", 8);
      }
      if (version < 9) {
        ctx.storage.transactionSync(() => {
          const columns = ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray();
          if (!columns.some(column => column.name === "selectedPremiumFeatures")) ctx.storage.sql.exec(tripFeatures);
        });
        await ctx.storage.put("schemaVersion", 9);
      }
      if (version < 10) {
        ctx.storage.transactionSync(() => {
          if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "onboardingStage")) ctx.storage.sql.exec(guidedSetup);
        });
        await ctx.storage.put("schemaVersion", 10);
      }
      if (version < 11) {
        ctx.storage.transactionSync(() => ctx.storage.sql.exec(destinationSearch));
        await ctx.storage.put("schemaVersion", 11);
      }
      if (version < 12) {
        ctx.storage.transactionSync(() => {
          if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("TripNotification")').toArray().some(c => c.name === "kind")) ctx.storage.sql.exec(eventAlerts);
        });
        await ctx.storage.put("schemaVersion", 12);
      }
      if (version < 13) {
        ctx.storage.transactionSync(() => ctx.storage.sql.exec(companyTrials));
        await ctx.storage.put("schemaVersion", 13);
      }
      this.secret = await ctx.storage.get<string>("authSecret") ?? "";
      if (!this.secret) { this.secret = crypto.randomUUID() + crypto.randomUUID(); await ctx.storage.put("authSecret", this.secret); }
      if (this.env.COMPANY_ADMIN_EMAIL && await ctx.storage.get("companyIdentity13") !== this.env.COMPANY_ADMIN_EMAIL) {
        const normalized = await appRuntime.run(this.runtime(), normalizeCompanyIdentity);
        if (normalized) await ctx.storage.put("companyIdentity13", this.env.COMPANY_ADMIN_EMAIL);
      }
      if (await this.aiTasks.pending()) await this.aiTasks.wake();
    });
  }
  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = this.pending.then(run, run);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
  private runtime() {
    return { database: this.database, files: this.env.ATTACHMENTS, assets: this.env.ASSETS, authSecret: this.secret, appUrl: this.env.BETTER_AUTH_URL, supportEmail: this.env.SUPPORT_EMAIL, companyAdminEmail: this.env.COMPANY_ADMIN_EMAIL, planAccessEnabled: this.env.PLAN_ACCESS_ENABLED === "true", paddle: paddleConfigFromEnv(this.env), wakeAi: (): Promise<void> => this.aiTasks.wake(), wakeNotifications: (): Promise<void> => this.aiTasks.wake(), wakeLocationExpiry: (at: number): Promise<void> => this.aiTasks.schedule(at) };
  }
  async alarm() { await this.ready; await this.aiTasks.alarm(); }
  async fetch(request: Request): Promise<Response> {
    await this.ready;
    // Let uploads and support delivery complete without blocking other members.
    // Each database operation and complete transaction still shares the lock.
    const payment = request.method === "POST" && /^\/api\/trips\/[^/]+\/expenses\/?$/.test(new URL(request.url).pathname);
    const independent = payment || (request.method === "POST" && new URL(request.url).pathname === "/api/support");
    const runtime = this.runtime();
    const context = independent ? { ...runtime, database: serializedDatabase(runtime.database, run => this.serialize(run)) } : runtime;
    const run = () => appRuntime.run(context, async () => {
      const response = await handler.fetch(request, this.env, { waitUntil: this.ctx.waitUntil.bind(this.ctx), passThroughOnException() {} });
      return new Response(response.body ? await response.arrayBuffer() : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    });
    return independent ? run() : this.serialize(run);
  }
  async maintenance() {
    await this.ready;
    return this.serialize(() => appRuntime.run(this.runtime(), async () => {
      await this.database.verification.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await this.database.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await expireMemberLocations();
      await queueDueDiscoveries();
      if (await this.aiTasks.pending()) await this.aiTasks.wake();
    }));
  }
}
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    if (request.method === "GET" || request.method === "HEAD") { const asset = await env.ASSETS.fetch(request); if (asset.status !== 404) return asset; }
    return env.APP.getByName("tripanize-main").fetch(request);
  },
  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    ctx.waitUntil((env.APP.getByName("tripanize-main") as DurableObjectStub<TripanizeApp>).maintenance());
  },
} satisfies ExportedHandler<CloudflareEnv>;

import { DurableObject } from "cloudflare:workers";
import handler from "vinext/server/app-router-entry";
import schema from "../prisma/migrations/202610220001_cloudflare_initial/migration.sql?raw";
import { createDatabase } from "../src/server/db";
import { appRuntime } from "../src/server/cloudflare/runtime";
import { DurableSqliteAdapter } from "../src/server/cloudflare/sqlite-adapter";
import { AiTasks } from "../src/server/cloudflare/ai-tasks";

/** Serialize application requests so relational transactions remain isolated.
 * Buffer each response before releasing the queue: streamed server components
 * must finish their database work before the next request starts a transaction.
 */
export class TripanizeApp extends DurableObject<CloudflareEnv> {
  private database = createDatabase(new DurableSqliteAdapter(this.ctx.storage));
  private pending: Promise<unknown> = Promise.resolve();
  private secret = "";
  private aiTasks = new AiTasks(this.ctx.storage, () => this.runtime(), (run) => this.serialize(run));
  constructor(ctx: DurableObjectState, env: CloudflareEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      if (await ctx.storage.get<number>("schemaVersion") !== 1) {
        ctx.storage.transactionSync(() => ctx.storage.sql.exec(schema));
        await ctx.storage.put("schemaVersion", 1);
      }
      this.secret = await ctx.storage.get<string>("authSecret") ?? "";
      if (!this.secret) { this.secret = crypto.randomUUID() + crypto.randomUUID(); await ctx.storage.put("authSecret", this.secret); }
      if (await this.aiTasks.pending()) await this.aiTasks.wake();
    });
  }
  private serialize<T>(run: () => Promise<T>): Promise<T> {
    const result = this.pending.then(run, run);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }
  private runtime() {
    return { database: this.database, files: this.env.ATTACHMENTS, assets: this.env.ASSETS, authSecret: this.secret, appUrl: this.env.BETTER_AUTH_URL, wakeAi: () => this.aiTasks.wake() };
  }
  async alarm() { await this.aiTasks.alarm(); }
  async fetch(request: Request): Promise<Response> {
    return this.serialize(() => appRuntime.run(this.runtime(), async () => {
      const response = await handler.fetch(request, this.env, { waitUntil: this.ctx.waitUntil.bind(this.ctx), passThroughOnException() {} });
      return new Response(response.body ? await response.arrayBuffer() : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    }));
  }
  async maintenance() {
    return this.serialize(() => appRuntime.run(this.runtime(), async () => {
      await this.database.verification.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await this.database.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
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

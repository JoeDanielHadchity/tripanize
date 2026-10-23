import { prepareEventDigests } from "@/server/notifications/events";
import { runDestinationSearch } from "@/server/destinations/service";
import { appRuntime, type AppRuntime } from "./runtime";
import { serializedDatabase, type Serialize } from "./serialized-db";
import { claimJob, runJob, type Generator, type PlanCheckpoint } from "@/server/planner/run";
import { generateStructured } from "@/server/ai/openai";
import { runDiscovery } from "@/server/events/discovery";
import { nextChangeEmailAt, sendNextChangeEmail } from "@/server/notifications/changes";
import { expireMemberLocations } from "@/server/locations/service";
import { sendNextTrialEmail } from "@/server/admin/trials";

/** Native durable alarms keep work alive after the user's request disconnects.
 * One planning section runs per alarm, below the 15-minute invocation limit.
 */
export class AiTasks {
  private running = false;
  constructor(private storage: DurableObjectStorage, private context: () => AppRuntime, private serialize: Serialize, private generate: Generator = generateStructured, private sendChanges: () => Promise<void> = sendNextChangeEmail, private sendTrial: () => Promise<boolean> = sendNextTrialEmail) {}

  // Called from an HTTP request/maintenance operation that already owns the lock.
  async wake() {
    await this.schedule(Date.now() + 1000);
  }

  async schedule(at: number) {
    const next = Math.max(Date.now() + 1000, at);
    const alarm = await this.storage.getAlarm();
    if (alarm === null || alarm > next) await this.storage.setAlarm(next);
  }

  private async pendingAi() {
    const db = this.context().database;
    return await db.destinationSearch.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }) > 0 ||
      await db.generationJob.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } }) > 0 ||
      await db.discoveryRun.count({ where: { status: { in: ["queued", "running"] } } }) > 0;
  }

  async pending() {
    return await this.pendingAi() || await this.context().database.tripNotification.count({ where: { emailStatus: { in: ["queued", "digest"] } } }) > 0 || await this.context().database.trialInvitation.count({ where: { emailStatus: "queued" } }) > 0 || await this.context().database.memberLocation.count({ where: { expiresAt: { not: null } } }) > 0;
  }

  async alarm() {
    if (this.running) return;
    this.running = true;
    let jobId: string | undefined;
    try {
      // Recovery wake-up also survives a runtime restart during an upstream call.
      await this.serialize(() => this.storage.setAlarm(Date.now() + 12 * 60_000));
      const runtime = this.context();
      await appRuntime.run({ ...runtime, database: serializedDatabase(runtime.database, this.serialize), wakeAi: undefined, wakeNotifications: undefined, wakeLocationExpiry: undefined }, async () => {
        await expireMemberLocations();
        await prepareEventDigests();
        if (await this.sendTrial()) return;
        await this.sendChanges();
        const nextEmail = await nextChangeEmailAt();
        if (nextEmail && nextEmail.getTime() <= Date.now()) return;
        const db = appRuntime.getStore()!.database;
        const job = await db.generationJob.findFirst({ where: { status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { createdAt: "asc" } });
        if (job) {
          jobId = job.id;
          if (job.status === "QUEUED" && !await claimJob(job.id)) return;
          const key = `ai-checkpoint:${job.id}`;
          await runJob(job.id, this.generate, {
            load: () => this.serialize(() => this.storage.get<PlanCheckpoint>(key)),
            save: (checkpoint) => this.serialize(() => this.storage.put(key, checkpoint)),
          });
          return;
        }
        const search = await db.destinationSearch.findFirst({ where: { status: { in: ["QUEUED", "RUNNING"] } }, orderBy: [{ queuedAt: "asc" }, { createdAt: "asc" }] });
        if (search) { await runDestinationSearch(search.id, this.generate); return; }
        // An interrupted event search is reported honestly instead of being left
        // running forever or automatically repeating external notifications.
        await db.discoveryRun.updateMany({ where: { status: "running" }, data: { status: "failed", finishedAt: new Date(), error: "The event search was interrupted. Please run a new check." } });
        const discovery = await db.discoveryRun.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
        if (discovery) await runDiscovery(discovery.id, this.generate);
      });
    } finally {
      try {
        await this.serialize(async () => {
          if (jobId) {
            const job = await this.context().database.generationJob.findUnique({ where: { id: jobId }, select: { status: true } });
            if (!job || !["QUEUED", "RUNNING"].includes(job.status)) await this.storage.delete(`ai-checkpoint:${jobId}`);
          }
          const nextEmail = await this.context().database.tripNotification.findFirst({ where: { emailStatus: { in: ["queued", "digest"] } }, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } });
          const location = await this.context().database.memberLocation.findFirst({ where: { expiresAt: { not: null } }, orderBy: { expiresAt: "asc" }, select: { expiresAt: true } });
          const trialEmail = await this.context().database.trialInvitation.findFirst({ where: { emailStatus: "queued" }, orderBy: { nextEmailAttemptAt: "asc" }, select: { nextEmailAttemptAt: true } });
          const candidates = [await this.pendingAi() ? Date.now() + 1000 : undefined, nextEmail?.nextAttemptAt?.getTime(), trialEmail?.nextEmailAttemptAt?.getTime(), location?.expiresAt?.getTime()].filter((n): n is number => n !== undefined);
          const next = candidates.length ? Math.min(...candidates) : undefined;
          if (next !== undefined) await this.storage.setAlarm(Math.max(Date.now() + 1000, next));
          else await this.storage.deleteAlarm();
        });
      } finally { this.running = false; }
    }
  }
}

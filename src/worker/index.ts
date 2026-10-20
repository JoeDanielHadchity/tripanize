import "dotenv/config";
import { prisma } from "@/server/db";
import { claimJob, failStaleJobs, runJob } from "@/server/planner/run";
import { runDiscovery } from "@/server/events/discovery";
import { sendDailyDigests } from "@/server/notifications/events";
import { aiConfigured } from "@/server/ai/openai";
import { todayIn } from "@/lib/dates";

/**
 * Background worker: runs AI planning jobs, manual and scheduled event discovery, and notification digests.
 * Run alongside the web server (`npm run worker`). Safe to run several instances: jobs are claimed atomically.
 */
const POLL_MS = 2000;
let stopping = false;
let lastScheduleCheck = 0;

async function tick() {
  const job = await prisma.generationJob.findFirst({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (job && (await claimJob(job.id))) {
    console.info(`[worker] job ${job.id} (${job.kind}) started`);
    await runJob(job.id);
    console.info(`[worker] job ${job.id} finished`);
    return true;
  }
  const run = await prisma.discoveryRun.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
  if (run) {
    await runDiscovery(run.id);
    return true;
  }
  if (Date.now() - lastScheduleCheck > 60_000) {
    lastScheduleCheck = Date.now();
    await failStaleJobs();
    await scheduleDiscovery();
    await sendDailyDigests();
  }
  return false;
}

/** Enqueues automatic discovery for trips that opted in, per their chosen frequency. */
async function scheduleDiscovery() {
  const due = await prisma.trip.findMany({ where: { autoDiscovery: true, nextDiscoveryAt: { lte: new Date() } }, select: { id: true, endDate: true, timezone: true, discoveryEveryHours: true } });
  for (const t of due) {
    const next = new Date(Date.now() + t.discoveryEveryHours * 3600_000);
    if (!t.endDate || t.endDate < todayIn(t.timezone)) {
      await prisma.trip.update({ where: { id: t.id }, data: { autoDiscovery: false, nextDiscoveryAt: null } });
      continue;
    }
    await prisma.trip.update({ where: { id: t.id }, data: { nextDiscoveryAt: next } });
    if (!aiConfigured()) {
      await prisma.discoveryRun.create({ data: { tripId: t.id, trigger: "scheduled", status: "failed", error: "OpenAI is not configured on this server, so automatic checks can't run.", finishedAt: new Date() } });
      continue;
    }
    const active = await prisma.discoveryRun.findFirst({ where: { tripId: t.id, status: { in: ["queued", "running"] } } });
    if (!active) await prisma.discoveryRun.create({ data: { tripId: t.id, trigger: "scheduled" } });
  }
}

async function main() {
  console.info(`[worker] started (AI ${aiConfigured() ? "configured" : "NOT configured"})`);
  await prisma.$executeRaw`SELECT 1`;
  while (!stopping) {
    let busy = false;
    try {
      busy = await tick();
    } catch (err) {
      console.error("[worker] tick failed", err instanceof Error ? err.message : err);
    }
    if (!busy) await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await prisma.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));
main();

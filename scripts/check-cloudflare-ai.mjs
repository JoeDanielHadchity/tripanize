import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const origin = "http://127.0.0.1:8793";
const state = `.wrangler/check-ai-${randomUUID()}`;
let logs = "";
async function start() {
  logs = "";
  const child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--ip", "127.0.0.1", "--port", "8793", "--inspector-port", "0", "--config", "tests/cloudflare/wrangler.ai.jsonc", "--persist-to", state], { env: { ...process.env, OPENAI_API_KEY: "", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local runtime startup timed out")), 35000);
    const inspect = part => { logs = (logs + part).slice(-12000); if (logs.includes("Ready on")) { clearTimeout(timer); resolve(); } };
    child.stdout.on("data", inspect); child.stderr.on("data", inspect);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Local runtime exited: ${code}`)); });
  });
  return child;
}
async function stop(child) { if (child?.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } }
async function get(path) { const r = await fetch(origin + path); const d = await r.json(); assert.equal(r.status, 200, JSON.stringify(d)); return d; }
async function until(predicate) {
  const end = Date.now() + 30000;
  while (Date.now() < end) { const state = await get("/state"); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error("AI state timed out");
}
let child;
try {
  child = await start();
  const queued = await get("/start");
  assert.equal(queued.jobId, queued.duplicateJobId);
  await until(s => s.calls.length === 1);
  const begin = Date.now();
  const concurrent = await get("/transaction");
  assert.ok(Date.now() - begin < 1000, "Website was blocked by upstream AI wait");
  assert.equal(concurrent.name, "Durable AI fixture");
  assert.equal(concurrent.itineraryStops, 0);
  await until(s => s.checkpointDays === 5);
  await stop(child); child = await start();
  const done = await until(s => s.jobs[0].status === "SUCCEEDED");
  assert.equal(done.jobs[0].days, 6);
  assert.deepEqual(done.calls.map(c => c.length), [5, 1]);
  assert.equal(done.itineraryStops, 0);
  assert.equal(done.checkpointDays, 0);
  const questions = await get("/questions");
  assert.ok(questions.pendingJobId);
  await until(s => s.jobs.some(j => j.kind === "questions" && j.status === "SUCCEEDED"));
  const readyQuestions = await get("/questions?poll=1");
  assert.equal(readyQuestions.source, "ai");
  assert.equal(readyQuestions.questions.length, 6);
  const cancelled = await get("/cancel");
  const cancelledState = await get("/state");
  assert.equal(cancelledState.jobs.find(j => j.id === cancelled.jobId).status, "CANCELLED");
  await get("/notifications/start");
  const failedEmail = await until(s => s.emailAttempts.length === 1 && s.notifications[0].attempts === 1);
  assert.equal(failedEmail.notifications[0].emailStatus, "queued");
  await get("/notifications/retry");
  await stop(child); child = await start();
  const emailed = await until(s => s.notifications[0]?.emailStatus === "sent");
  assert.equal(emailed.notifications.length, 1);
  assert.equal(emailed.emailAttempts.length, 2);
  assert.equal(emailed.emailAttempts[0], emailed.emailAttempts[1]);
  await get("/locations/start");
  assert.equal((await get("/locations/state"))[0].lat, 38.7);
  await stop(child); child = await start();
  const expiryDeadline = Date.now() + 15000;
  let locationState;
  do { locationState = await get("/locations/state"); if (locationState[0].lat === null) break; await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < expiryDeadline);
  assert.equal(locationState[0].lat, null);
  assert.equal(locationState[0].leaseHash, null);
  assert.equal(locationState[0].expiresAt, null);
  console.log(JSON.stringify({ nativeAlarms: true, duplicateClicksDeduplicated: true, websiteResponsiveDuringGeneration: true, transactionRollbackIsolated: true, resumesAfterRestart: true, completedSectionsNotRepeated: true, questionsInBackground: true, cancellation: true, itineraryUnchangedUntilAccepted: true, notificationRetriesAfterRestart: true, notificationIdempotency: true, locationExpiresAfterRestart: true, externalApiCalls: 0 }));
} catch (error) { console.error(error.stack ?? error.message); console.error(logs.replace(/sk-[A-Za-z0-9_-]+/g, "[credential hidden]")); process.exitCode = 1; }
finally { await stop(child); }

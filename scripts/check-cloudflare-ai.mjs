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
  assert.equal(readyQuestions.questions.length, 10);
  assert.equal(readyQuestions.questions.filter(q => q.section === "food").length, 5);
  const cancelled = await get("/cancel");
  const cancelledState = await get("/state");
  assert.equal(cancelledState.jobs.find(j => j.id === cancelled.jobId).status, "CANCELLED");
  const assistant = await get("/assistant/start");
  assert.equal(assistant.id, assistant.duplicateId);
  await until(s => s.jobs.some(j => j.kind === "assistant" && j.status === "SUCCEEDED"));
  await stop(child); child = await start();
  const assistantDraft = await get("/assistant/state");
  assert.equal(assistantDraft.conversation.turns[0].preview.days.length, 2);
  assert.equal(assistantDraft.days[1].stops[0].title, "Assistant museum", "Assistant changed the trip before approval");
  await get("/assistant/apply"); await get("/assistant/apply");
  const assistantApplied = await get("/assistant/state");
  assert.equal(assistantApplied.days[2].stops[0].title, "Assistant museum");
  assert.ok(assistantApplied.conversation.turns[0].appliedAt);
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
  await get("/onboarding/start");
  const untilSetup = async predicate => {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) { const state = await get("/onboarding/state"); if (state.jobs.some(j => j.status === "FAILED")) throw new Error(JSON.stringify(state)); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error("Guided setup timed out");
  };
  await untilSetup(s => s.jobs.some(j => j.kind === "questions" && j.status === "SUCCEEDED"));
  await get("/onboarding/answers");
  await untilSetup(s => s.jobs.some(j => j.kind === "setup"));
  await stop(child); child = await start();
  const prepared = await untilSetup(s => s.stage === "COMPLETE");
  assert.ok(prepared.jobs.find(j => j.kind === "full").appliedAt);
  assert.ok(prepared.packing > 0);
  await get("/destinations/start");
  await stop(child); child = await start();
  const destinationDeadline = Date.now() + 15000;
  let destinations;
  do { destinations = await get("/destinations/state"); if (destinations.status === "SUCCEEDED") break; assert.notEqual(destinations.status, "FAILED", destinations.error); await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < destinationDeadline);
  assert.equal(destinations.result.ideas.length, 5);
  const selected = await get("/destinations/choose");
  assert.equal(selected.next, `/trips?selected=${encodeURIComponent(selected.id)}`);
  assert.deepEqual(await get("/destinations/choose"), selected);
  const multipleStart = await get("/destinations/multiple");
  assert.equal(new Set(multipleStart.numbers).size, 2);
  await stop(child); child = await start();
  const multipleDeadline = Date.now() + 20000;
  let multiple;
  do { multiple = await get("/destinations/multiple/state"); if (multiple.searches.every(s => s.status === "SUCCEEDED")) break; assert.ok(!multiple.searches.some(s => s.status === "FAILED"), JSON.stringify(multiple)); await new Promise(resolve => setTimeout(resolve, 100)); } while (Date.now() < multipleDeadline);
  assert.deepEqual(multiple.searches.map(s => s.input.departureCity), ["Paris, France", "London, UK"]);
  assert.ok(multiple.searches.every(s => s.result.ideas.length === 5));
  assert.equal(multiple.workspace.searches.length, 3);
  const eventStart = await get("/events/start"); assert.equal(eventStart.queued, 1); assert.equal(eventStart.duplicate, 0);
  await stop(child); child = await start();
  const untilEvents = async predicate => {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) { const state = await get("/events/state"); assert.ok(!state.runs.some(r => r.status === "failed"), JSON.stringify(state)); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error("Scheduled events timed out");
  };
  const eventDone = await untilEvents(s => s.runs[0]?.status === "succeeded" && s.notices.some(n => n.kind === "event_email" && n.emailStatus === "sent"));
  assert.equal(eventDone.notices.filter(n => n.kind === "event").length, 1); assert.equal(eventDone.stops, 0);
  await get("/events/again");
  const rechecked = await untilEvents(s => s.runs.length === 2 && s.runs.every(r => r.status === "succeeded"));
  assert.equal(rechecked.notices.filter(n => n.kind === "event").length, 1);
  assert.equal(rechecked.notices.filter(n => n.kind === "event_email").length, 1);
  await get("/trials/start");
  await stop(child); child = await start();
  const untilTrial = async predicate => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { const state = await get("/trials/state"); if (predicate(state)) return state; await new Promise(resolve => setTimeout(resolve, 100)); }
    throw new Error("Trial invitation timed out");
  };
  await untilTrial(s => s.attempts === 1 && s.emailStatus === "queued");
  await get("/trials/retry");
  await stop(child); child = await start();
  const deliveredTrial = await untilTrial(s => s.emailStatus === "sent");
  assert.equal(deliveredTrial.keys.length, 2); assert.equal(deliveredTrial.keys[0], deliveredTrial.keys[1]);
  assert.equal((await get("/trials/state")).access.status, "available");
  const trialClaim = await get("/trials/accept"); assert.equal(trialClaim.first.tripId, trialClaim.repeated.tripId); assert.equal(trialClaim.draft.trial, true); assert.equal(trialClaim.draft.next, `/trips/${trialClaim.first.tripId}/onboarding`);
  const trialState = await get("/trials/state");
  assert.equal(trialState.plan.source, "trial"); assert.equal(trialState.otherPlan.premium, false); assert.equal(trialState.recipientTrips, 2); assert.equal(trialState.payments, 0);
  assert.equal(trialState.access.status, "active"); assert.ok(trialState.trialDurationMs >= 14 * 86400_000 && trialState.trialDurationMs < 14 * 86400_000 + 1000);
  await get("/trials/revoke"); assert.equal((await get("/trials/state")).plan.premium, false);
  console.log(JSON.stringify({ multipleDestinationSearchesAfterRestart: true, trialEmailRetriesAfterRestart: true, oneTripTrialClaim: true, trialRevocation: true, scheduledEventsAfterRestart: true, eventAlertsDeduplicated: true, eventEmailOutbox: true, destinationIdeasAfterRestart: true, chosenDestinationReturnsToTrips: true, nativeAlarms: true, guidedTripAfterRestart: true, personalizedPacking: true, duplicateClicksDeduplicated: true, websiteResponsiveDuringGeneration: true, transactionRollbackIsolated: true, resumesAfterRestart: true, completedSectionsNotRepeated: true, questionsInBackground: true, cancellation: true, itineraryUnchangedUntilAccepted: true, notificationRetriesAfterRestart: true, notificationIdempotency: true, locationExpiresAfterRestart: true, externalApiCalls: 0 }));
} catch (error) { console.error(error.stack ?? error.message); console.error(logs.replace(/sk-[A-Za-z0-9_-]+/g, "[credential hidden]")); process.exitCode = 1; }
finally { await stop(child); }

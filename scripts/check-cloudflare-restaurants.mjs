import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

const origin = "http://127.0.0.1:8795";
const state = `.wrangler/check-restaurants-${randomUUID()}`;
let child;
let logs = "";
async function start() {
  logs = "";
  child = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--ip", "127.0.0.1", "--port", "8795", "--inspector-port", "0", "--config", "tests/cloudflare/wrangler.ai.jsonc", "--persist-to", state], { env: { ...process.env, OPENAI_API_KEY: "", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local Worker startup timed out")), 35000);
    const inspect = part => { logs = (logs + part).slice(-10000); if (logs.includes("Ready on")) { clearTimeout(timer); resolve(); } };
    child.stdout.on("data", inspect); child.stderr.on("data", inspect);
    child.once("exit", code => { clearTimeout(timer); reject(new Error(`Local Worker exited: ${code}`)); });
  });
}
async function stop() { if (child?.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } }
async function get(path) { const response = await fetch(origin + path); const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body)); return body; }
async function until(path, test) {
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) { const body = await get(path); if (test(body)) return body; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error(`Worker state timed out: ${path}`);
}
try {
  await start();
  await get("/start");
  await until("/state", s => s.jobs[0].status === "SUCCEEDED");
  const refresh = await get("/restaurants/start");
  await until("/state", s => s.checkpointDays === 5 && s.jobs.some(j => j.id === refresh.jobId && j.status === "RUNNING"));
  assert.equal((await get("/restaurants/state")).names.length, 0, "Refresh wrote a partial restaurant selection");
  await stop(); await start();
  const done = await until("/restaurants/state", s => s.jobs.some(j => j.id === refresh.jobId && j.status === "SUCCEEDED"));
  assert.equal(done.names.length, 36);
  assert.equal(new Set(done.names).size, 36);
  console.log(JSON.stringify({ nativeRestaurantRefresh: true, resumesAfterRestart: true, atomicWholeTripUpdate: true, uniqueRestaurants: 36, externalApiCalls: 0 }));
} catch (error) { console.error(error.stack ?? error.message); console.error(logs.replace(/sk-[A-Za-z0-9_-]+/g, "[credential hidden]")); process.exitCode = 1; }
finally { await stop(); }

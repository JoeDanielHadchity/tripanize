import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "storage";
let config = mode === "storage" ? "tests/cloudflare/wrangler.jsonc" : "dist/server/wrangler.json";
const port = mode === "storage" ? 8789 : 8787;
const origin = `http://127.0.0.1:${port}`;
if (mode === "app") {
  const local = JSON.parse(readFileSync(config, "utf8"));
  delete local.routes;
  local.vars = { ...local.vars, APP_URL: origin, BETTER_AUTH_URL: origin };
  config = "dist/server/wrangler.local-check.json";
  writeFileSync(config, JSON.stringify(local));
}
let logs = "";
async function start() {
  logs = "";
  const args = ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--ip", "127.0.0.1", "--inspector-port", "0", "--config", config, "--port", String(port), "--persist-to", `.wrangler/check-${mode}`];
  if (mode === "app") args.push("--var", `APP_URL:${origin}`, "--var", `BETTER_AUTH_URL:${origin}`);
  const child = spawn(process.execPath, args, { env: { ...process.env, OPENAI_API_KEY: "", RESEND_API_KEY: "", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Local Cloudflare startup timed out")), 35000);
    const inspect = (chunk) => { logs = (logs + chunk).slice(-16000); if (logs.includes("Ready on")) { clearTimeout(timer); resolve(); } };
    child.stdout.on("data", inspect); child.stderr.on("data", inspect);
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Cloudflare exited during startup (${code})`)); });
  }).catch((error) => { child.kill("SIGTERM"); throw error; });
  return child;
}
async function stop(child) { if (child.exitCode === null) { child.kill("SIGTERM"); await once(child, "exit"); } }
async function json(path, init) { const response = await fetch(origin + path, init); const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data)); return data; }

let child;
try {
  child = await start();
  if (mode === "storage") {
    const result = await json("/run");
    assert.equal(result.days, 3);
    assert.deepEqual(result.interests, ["architecture"]);
    assert.equal(result.bookingProjections, 1);
    assert.equal(result.linkedEventProjections, 1);
    assert.equal(result.suggestionStayedUnscheduled, true);
    assert.equal(result.totalMinor, 3001);
    assert.equal(result.rolledBack, true);
    assert.equal(result.locationVisible, true);
    assert.equal(result.locationCleared, true);
    assert.equal(result.updatedRows, 1);
    assert.equal(result.staleRows, 0);
    assert.equal(result.privateFileRoundTrip, true);
    assert.equal(result.pdfHeader, "%PDF");
    await stop(child); child = await start();
    assert.equal((await json("/count")).users, result.users);
    console.log(JSON.stringify({ mode, ...result, survivesRestart: true }));
  } else {
    const home = await fetch(origin); assert.equal(home.status, 200); const html = await home.text(); assert.match(html, /Tripanize/);
    const assets = [...new Set([...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map((m) => m[1]).filter((v) => v.startsWith("/_next/static/") && /\.(js|css)$/.test(v)))];
    assert.ok(assets.length);
    for (const path of assets.slice(0, 5)) assert.equal((await fetch(origin + path)).status, 200, path);
    assert.equal((await fetch(origin + "/fonts/inter-latin-wght-normal.woff2")).status, 200);
    const signupPage = await fetch(origin + "/sign-up"); assert.equal(signupPage.status, 200);
    const signup = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: "Hosting check", email: `hosting-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() + "Aa1!" }) });
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookie = signup.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
    assert.ok(cookie);
    const trips = await fetch(origin + "/trips", { headers: { Cookie: cookie } }); assert.equal(trips.status, 200); assert.equal(new URL(trips.url).pathname, "/trips"); assert.match(await trips.text(), /trips/i);
    const newTrip = await fetch(origin + "/trips/new", { headers: { Cookie: cookie } }); assert.equal(newTrip.status, 200); assert.equal(new URL(newTrip.url).pathname, "/trips/new");
    const unauth = await fetch(origin + "/api/attachments/does-not-exist"); assert.equal(unauth.status, 401);
    const locationUnauth = await fetch(origin + "/api/trips/does-not-exist/locations"); assert.equal(locationUnauth.status, 401); assert.equal(locationUnauth.headers.get("Cache-Control"), "private, no-store");
    const locationMissing = await fetch(origin + "/api/trips/does-not-exist/locations", { headers: { Cookie: cookie } }); assert.equal(locationMissing.status, 404);
    const locationCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/locations", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ op: "stop" }) }); assert.equal(locationCrossOrigin.status, 403);
    await stop(child); child = await start();
    const restored = await fetch(origin + "/trips", { headers: { Cookie: cookie } }); assert.equal(restored.status, 200); assert.equal(new URL(restored.url).pathname, "/trips");
    console.log(JSON.stringify({ mode, home: 200, signup: 200, authenticatedTrips: 200, newTripForm: 200, privateFileGuard: 401, staticAssets: true, sessionSurvivesRestart: true, aiConnected: false }));
  }
} catch (error) { await new Promise((resolve) => setTimeout(resolve, 200)); console.error(error.stack ?? error.message); console.error(logs.slice(-11000)); process.exitCode = 1; }
finally { if (child) await stop(child); }

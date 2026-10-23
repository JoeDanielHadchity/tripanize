import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "storage";
let config = mode === "storage" ? "tests/cloudflare/wrangler.jsonc" : "dist/server/wrangler.json";
const port = mode === "storage" ? 8789 : 8787;
const origin = `http://127.0.0.1:${port}`;
const persistTo = mode === "app" ? `.wrangler/check-app-${process.pid}` : `.wrangler/check-${mode}`;
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
  const args = ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--ip", "127.0.0.1", "--inspector-port", "0", "--config", config, "--port", String(port), "--persist-to", persistTo];
  if (mode === "app") args.push("--var", `APP_URL:${origin}`, "--var", `BETTER_AUTH_URL:${origin}`, "--var", "COMPANY_ADMIN_EMAIL:company@example.test");
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
    const billing = await json("/billing-request");
    assert.deepEqual(billing, { nativeRequests: 2, rejectedRedirects: 2, pinnedHost: true });
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
    assert.equal(result.chatDeduplicated, true);
    assert.equal(result.chatUnread, 1);
    assert.equal(result.chatRead, true);
    assert.equal(result.chatDeleted, true);
    assert.equal(result.updatedRows, 1);
    assert.equal(result.staleRows, 0);
    assert.equal(result.privateFileRoundTrip, true);
    assert.equal(result.expenseReceiptRoundTrip, true);
    assert.equal(result.largeRelationQueries, true);
    assert.equal(result.pdfHeader, "%PDF");
    await stop(child); child = await start();
    assert.equal((await json("/count")).users, result.users);
    assert.deepEqual(await json("/chat-count"), { messages: 1, unread: 0 });
    assert.deepEqual(await json("/feature-selection"), { features: ["expenses", "chat"] });
    assert.deepEqual(await json("/expense-receipt"), { linked: true, readable: true });
    const plans = await json("/plans");
    assert.equal(plans.normalDenied, true);
    assert.deepEqual(plans.aiDates, ["2027-05-01", "2027-05-02"]);
    assert.equal(plans.premiumUnlocked, true);
    assert.equal(plans.expiryEnforced, true);
    console.log(JSON.stringify({ mode, ...result, survivesRestart: true, plans, billing }));
  } else {
    const home = await fetch(origin); assert.equal(home.status, 200); const html = await home.text(); assert.match(html, /Tripanize/);
    const plansPage = await fetch(origin + "/plans"); assert.equal(plansPage.status, 200); assert.match(await plansPage.text(), /First 2 days per trip/);
    for (const path of ["/terms", "/privacy", "/refunds", "/contact"]) {
      assert.match(html, new RegExp(`href="${path}"`));
      const policy = await fetch(origin + path); assert.equal(policy.status, 200, path); assert.equal(new URL(policy.url).pathname, path);
      const policyHtml = await policy.text(); assert.match(policyHtml, /the company/i); assert.doesNotMatch(policyHtml, /an individual (?:operator )?based/i);
    }
    const unsupported = await fetch(origin + "/api/support", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Isolated test", email: "test@example.test", topic: "general", message: "An isolated test. No email should be sent.", website: "", requestId: crypto.randomUUID() }) });
    assert.equal(unsupported.status, 503); assert.equal((await unsupported.json()).sent, undefined);
    const assets = [...new Set([...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map((m) => m[1]).filter((v) => v.startsWith("/_next/static/") && /\.(js|css)$/.test(v)))];
    assert.ok(assets.length);
    for (const path of assets.slice(0, 5)) assert.equal((await fetch(origin + path)).status, 200, path);
    assert.equal((await fetch(origin + "/fonts/inter-latin-wght-normal.woff2")).status, 200);
    const signupPage = await fetch(origin + "/sign-up"); assert.equal(signupPage.status, 200);
    const signup = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: "Hosting check", email: `hosting-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() + "Aa1!" }) });
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookie = signup.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
    assert.ok(cookie);
    for (const path of ["/", "/sign-in", "/sign-up"]) {
      const landing = await fetch(origin + path, { headers: { Cookie: cookie } });
      assert.equal(new URL(landing.url).pathname, "/start", path);
      const landingHtml = await landing.text();
      assert.match(landingHtml, /I have a destination in mind/);
      assert.match(landingHtml, /Let me help you choose/);
      assert.match(landingHtml, /href="\/destinations"/);
      assert.doesNotMatch(landingHtml, /Search trips/);
    }
    const directAccount = await fetch(origin + "/sign-in?next=%2Faccount", { headers: { Cookie: cookie } }); assert.equal(new URL(directAccount.url).pathname, "/account");
    const destinationPage = await fetch(origin + "/destinations", { headers: { Cookie: cookie } }); assert.equal(new URL(destinationPage.url).pathname, "/destinations"); assert.match(await destinationPage.text(), /Your destination searches/);
    const privateDiscovery = await fetch(origin + "/destinations"); assert.equal(new URL(privateDiscovery.url).pathname, "/sign-in");
    const trips = await fetch(origin + "/trips", { headers: { Cookie: cookie } }); assert.equal(trips.status, 200); assert.equal(new URL(trips.url).pathname, "/trips"); const tripsHtml = await trips.text(); assert.match(tripsHtml, /trips/i); assert.doesNotMatch(tripsHtml, /Choose how to start|Your destination searches/);
    const newTrip = await fetch(origin + "/trips/new", { headers: { Cookie: cookie } }); assert.equal(newTrip.status, 200); assert.equal(new URL(newTrip.url).pathname, "/trips/new");
    const deniedCompany = await fetch(origin + "/company", { headers: { Cookie: cookie } }); assert.equal(deniedCompany.status, 404);
    const deniedTrial = await fetch(origin + "/trial?invitation=not-yours", { headers: { Cookie: cookie } }); assert.equal(deniedTrial.status, 404);
    const reauth = await fetch(origin + "/sign-in?reauth=1&next=%2Faccount", { headers: { Cookie: cookie } }); assert.equal(new URL(reauth.url).pathname, "/sign-in"); assert.match(await reauth.text(), /Sign in to Tripanize/);
    const companySignup = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: "Retired personal label", email: "company@example.test", password: crypto.randomUUID() + "Aa1!" }) });
    assert.equal(companySignup.status, 200, await companySignup.clone().text());
    const companyUser = await companySignup.json(); assert.equal(companyUser.user.name, "The company"); assert.equal(companyUser.user.emailVerified, false);
    const companyCookie = companySignup.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    assert.equal((await fetch(origin + "/company", { headers: { Cookie: companyCookie } })).status, 404);
    const changedName = await fetch(origin + "/api/auth/update-user", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: companyCookie }, body: JSON.stringify({ name: "Another personal label" }) }); assert.equal(changedName.status, 200);
    const companyAccountHtml = await (await fetch(origin + "/account", { headers: { Cookie: companyCookie } })).text(); assert.match(companyAccountHtml, /The company/); assert.doesNotMatch(companyAccountHtml, /Another personal label|Retired personal label/);
    const unauth = await fetch(origin + "/api/attachments/does-not-exist"); assert.equal(unauth.status, 401);
    const locationUnauth = await fetch(origin + "/api/trips/does-not-exist/locations"); assert.equal(locationUnauth.status, 401); assert.equal(locationUnauth.headers.get("Cache-Control"), "private, no-store");
    const locationMissing = await fetch(origin + "/api/trips/does-not-exist/locations", { headers: { Cookie: cookie } }); assert.equal(locationMissing.status, 404);
    const locationCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/locations", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ op: "stop" }) }); assert.equal(locationCrossOrigin.status, 403);
    const chatUnauth = await fetch(origin + "/api/trips/does-not-exist/chat"); assert.equal(chatUnauth.status, 401); assert.equal(chatUnauth.headers.get("Cache-Control"), "private, no-store");
    const chatMissing = await fetch(origin + "/api/trips/does-not-exist/chat", { headers: { Cookie: cookie } }); assert.equal(chatMissing.status, 404);
    const chatCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/chat", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ op: "read", seq: 1 }) }); assert.equal(chatCrossOrigin.status, 403);
    const assistantUnauth = await fetch(origin + "/api/trips/does-not-exist/assistant"); assert.equal(assistantUnauth.status, 401); assert.equal(assistantUnauth.headers.get("Cache-Control"), "private, no-store");
    const assistantMissing = await fetch(origin + "/api/trips/does-not-exist/assistant", { headers: { Cookie: cookie } }); assert.equal(assistantMissing.status, 404);
    const assistantCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/assistant", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ op: "apply", id: "not-a-proposal" }) }); assert.equal(assistantCrossOrigin.status, 403);
    const receiptUnauth = await fetch(origin + "/api/trips/does-not-exist/expenses", { method: "POST", headers: { Origin: origin, "Content-Type": "multipart/form-data; boundary=test" }, body: "--test--" });
    assert.equal(receiptUnauth.status, 401); assert.equal(receiptUnauth.headers.get("Cache-Control"), "private, no-store");
    const receiptCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/expenses", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "multipart/form-data; boundary=test", Cookie: cookie }, body: "--test--" });
    assert.equal(receiptCrossOrigin.status, 403);
    const receiptMissingTrip = await fetch(origin + "/api/trips/does-not-exist/expenses", { method: "POST", headers: { Origin: origin, "Content-Type": "multipart/form-data; boundary=test", Cookie: cookie }, body: "--test--" });
    assert.equal(receiptMissingTrip.status, 404);
    await stop(child); child = await start();
    const restored = await fetch(origin + "/trips", { headers: { Cookie: cookie } }); assert.equal(restored.status, 200); assert.equal(new URL(restored.url).pathname, "/trips");
    console.log(JSON.stringify({ mode, companyAdminGuard: true, companyNamePrivate: true, reauthAvailable: true, home: 200, signup: 200, authenticatedTrips: 200, newTripForm: 200, privateFileGuard: 401, staticAssets: true, sessionSurvivesRestart: true, aiConnected: false }));
  }
} catch (error) { await new Promise((resolve) => setTimeout(resolve, 200)); console.error(error.stack ?? error.message); console.error(logs.slice(-11000)); process.exitCode = 1; }
finally { if (child) await stop(child); }

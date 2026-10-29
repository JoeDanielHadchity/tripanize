import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "storage";
let config = mode === "storage" ? "tests/cloudflare/wrangler.jsonc" : "dist/server/wrangler.json";
const port = mode === "storage" ? 8789 : 8787;
const origin = `http://127.0.0.1:${port}`;
const persistTo = mode === "app" ? `.wrangler/check-app-${process.pid}-${crypto.randomUUID()}` : `.wrangler/check-${mode}`;
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

function assertMemberNavigation(html) {
  const main = html.match(/<nav\b(?=[^>]*aria-label="Main")[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(main, "Signed-in pages must retain the main navigation");
  const links = [...main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  assert.deepEqual(links.map(([, attrs]) => attrs.match(/href="([^"]+)"/)?.[1]), ["/", "/plans", "/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"]);
  assert.deepEqual(links.map(([, , label]) => label.replace(/<[^>]*>/g, "")), ["Home", "Plans", "Trip Planner", "Group Travel", "Expense splitter"]);
  assert.match(html, /aria-label="Account"/);
  assert.match(html, /class="app-header-bar"/);
  assert.match(html, /href="\/account"/);
  assert.match(html, /aria-label="Notifications"/);
  assert.match(html, /Sign out/);
}

let child;
try {
  child = await start();
  if (mode === "storage") {
    assert.deepEqual(await json("/city-guide-copy"), { copied: 2, days: 8, privateCopies: true, perPersonBudgetNotApplied: true, bookingsUnconfirmed: true });
    const accountMode = await json("/mode-check");
    for (const [check, passed] of Object.entries(accountMode)) assert.equal(passed, true, `account mode: ${check}`);
    const travelTools = await json("/travel-tools");
    for (const [check, passed] of Object.entries(travelTools)) assert.equal(passed, true, `travel tools: ${check}`);
    const administration = await json("/admin-check");
    for (const [check, passed] of Object.entries(administration)) assert.equal(passed, true, `admin: ${check}`);
    const billing = await json("/billing-request");
    assert.deepEqual(billing, { nativeRequests: 2, rejectedRedirects: 2, pinnedHost: true });
    assert.equal((await json("/meal-options")).persisted, true);
    assert.equal((await json("/trip-cover")).persisted, true);
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
    assert.equal((await json("/mode-state")).persisted, true);
    assert.equal((await json("/meal-options")).persisted, true);
    assert.equal((await json("/trip-cover")).persisted, true);
    const restoredTools = await json("/travel-tools-state");
    for (const [check, passed] of Object.entries(restoredTools)) assert.equal(passed, true, `restored travel tools: ${check}`);
    assert.equal((await json("/count")).users, result.users);
    assert.deepEqual(await json("/chat-count"), { messages: 1, unread: 0 });
    assert.deepEqual(await json("/feature-selection"), { features: ["expenses", "chat"] });
    assert.deepEqual(await json("/expense-receipt"), { linked: true, readable: true });
    const plans = await json("/plans");
    assert.equal(plans.normalDenied, true);
    assert.deepEqual(plans.aiDates, ["2027-05-01", "2027-05-02"]);
    assert.equal(plans.premiumUnlocked, true);
    assert.equal(plans.expiryEnforced, true);
    console.log(JSON.stringify({ mode, ...result, survivesRestart: true, plans, billing, administration, travelTools, accountMode }));
  } else {
    const home = await fetch(origin); assert.equal(home.status, 200); const html = await home.text(); assert.match(html, /Tripanize/);
    assert.match(html, /<title>Trip Planner &amp; Group Travel Organizer \| Tripanize<\/title>/);
    assert.match(html, /rel="canonical" href="https:\/\/www\.tripanize\.app\/?"/);
    assert.match(html, /name="robots" content="index,\s*follow"/);
    assert.doesNotMatch(html, /name="robots" content="[^"]*noindex/);
    const structured = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    assert.ok(structured.some(value => value["@graph"]?.some(node => node["@type"] === "Organization" && node.name === "Tripanize.app")));
    const sitemap = await fetch(origin + "/sitemap.xml"); assert.equal(sitemap.status, 200); assert.match(sitemap.headers.get("Content-Type"), /xml/);
    const sitemapXml = await sitemap.text(); assert.match(sitemapXml, /https:\/\/www\.tripanize\.app\/examples\/lisbon-porto/); assert.doesNotMatch(sitemapXml, /\/(?:trips|account|company|checkout|invite|trial|api|mobile-preview)(?:\/|<)/);
    const robots = await fetch(origin + "/robots.txt"); assert.equal(robots.status, 200); assert.match(await robots.text(), /Sitemap: https:\/\/www\.tripanize\.app\/sitemap.xml/);
    assert.match(html, /id="trip-ideas"/);
    const guidePhotoHashes = new Set();
    for (const slug of ["bangkok", "hong-kong", "london", "paris", "istanbul"]) {
      const path = `/examples/${slug}`;
      const guide = await fetch(origin + path); assert.equal(guide.status, 200, path);
      const guideHtml = await guide.text();
      assert.match(html, new RegExp(`href="${path}"`));
      assert.match(sitemapXml, new RegExp(`https://www\\.tripanize\\.app${path}<`));
      assert.match(guideHtml, new RegExp(`rel="canonical" href="https://www\\.tripanize\\.app${path}"`));
      assert.match(guideHtml, /name="robots" content="index,\s*follow"/);
      assert.equal([...guideHtml.matchAll(/class="guide-day-panel"/g)].length, 4);
      assert.equal([...guideHtml.matchAll(/class="guide-day-panel"[^>]*hidden=""/g)].length, 3);
      assert.match(guideHtml, /Per person/); assert.match(guideHtml, /not live quotes/);
      assert.match(guideHtml, /href="\/sign-in\?next=%2Fexamples%2F[^\"]+%23use-itinerary"/);
      assert.doesNotMatch(guideHtml, /id="copy-date"/);
      for (const suffix of ["", "-card", "-small", "-card-small"]) {
        const asset = await fetch(origin + `/editorial/city-guides/${slug}${suffix}.webp`); assert.equal(asset.status, 200);
        if (["", "-card"].includes(suffix)) guidePhotoHashes.add(Buffer.from(await crypto.subtle.digest("SHA-256", await asset.arrayBuffer())).toString("hex"));
        else await asset.arrayBuffer();
      }
    }
    assert.equal(guidePhotoHashes.size, 10, "Guide and homepage photographs must all be different");
    for (const path of ["/plans", "/contact", "/terms", "/privacy", "/refunds", "/examples", "/examples/lisbon-porto", "/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"]) {
      const publicPage = await fetch(origin + path); assert.equal(publicPage.status, 200, path);
      const publicHtml = await publicPage.text();
      assert.match(publicHtml, new RegExp(`rel="canonical" href="https://www\\.tripanize\\.app${path}"`));
      assert.doesNotMatch(publicHtml, /name="robots" content="[^"]*noindex/, path);
      if (["/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"].includes(path)) {
        assert.match(sitemapXml, new RegExp(`https://www\\.tripanize\\.app${path}<`));
        assert.match(html, new RegExp(`href="${path}"`));
        assert.match(publicHtml, /<h1[^>]*id="feature-title"/);
        assert.match(publicHtml, /<details/);
        assert.match(publicHtml, /Illustrative/);
        assert.match(publicHtml, /href="\/sign-up"/);
        assert.match(publicHtml, /\$15/);
        for (const related of ["/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"].filter(value => value !== path)) assert.match(publicHtml, new RegExp(`href="${related}"`));
      }
    }
    const signinSeo = await (await fetch(origin + "/sign-in")).text(); assert.match(signinSeo, /name="robots" content="noindex,\s*nofollow"/);
    const plansPage = await fetch(origin + "/plans"); assert.equal(plansPage.status, 200);
    const plansHtml = await plansPage.text();
    assert.match(plansHtml, /id="premium-pass-title"/);
    assert.match(plansHtml, /One payment for the whole group/);
    assert.match(plansHtml, /AI for the first 2 days/);
    assert.equal([...plansHtml.matchAll(/class="premium-pass-step"/g)].length, 4);
    assert.doesNotMatch(plansHtml, /<table/);
    for (const path of ["/terms", "/privacy", "/refunds", "/contact"]) {
      assert.match(html, new RegExp(`href="${path}"`));
      const policy = await fetch(origin + path); assert.equal(policy.status, 200, path); assert.equal(new URL(policy.url).pathname, path);
      const policyHtml = await policy.text(); assert.match(policyHtml, /Tripanize\.app/); assert.doesNotMatch(policyHtml, /an individual (?:operator )?based|Joe Daniel Hadchity/i);
    }
    const unsupported = await fetch(origin + "/api/support", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Isolated test", email: "test@example.test", topic: "general", message: "An isolated test. No email should be sent.", website: "", requestId: crypto.randomUUID() }) });
    assert.equal(unsupported.status, 503); assert.equal((await unsupported.json()).sent, undefined);
    const assets = [...new Set([...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map((m) => m[1]).filter((v) => v.startsWith("/_next/static/") && /\.(js|css)$/.test(v)))];
    assert.ok(assets.length);
    for (const path of assets.slice(0, 5)) assert.equal((await fetch(origin + path)).status, 200, path);
    assert.equal((await fetch(origin + "/fonts/inter-latin-wght-normal.woff2")).status, 200);
    for (const font of ["nunito-latin-wght-normal.woff2", "fraunces-latin-full-normal.woff2", "caveat-latin-wght-normal.woff2"]) assert.equal((await fetch(origin + "/fonts/" + font)).status, 200, font);
    const photos = ["home", "auth", "welcome", "trips", "ideas", "guide", "itinerary", "events", "expenses", "chat", "packing", "settings"];
    const photoHashes = new Set();
    for (const photo of photos) {
      const asset = await fetch(origin + "/editorial/" + photo + ".webp"); assert.equal(asset.status, 200, photo);
      photoHashes.add(Buffer.from(await crypto.subtle.digest("SHA-256", await asset.arrayBuffer())).toString("hex"));
    }
    assert.equal(photoHashes.size, photos.length, "Editorial photos must all be different");
    assert.match(html, /id="how-it-works"/); assert.match(html, /Plan less/);
    const publicCatalogResponse = await fetch(origin + "/api/mobile/public");
    assert.equal(publicCatalogResponse.status, 200); assert.equal(publicCatalogResponse.headers.get("Cache-Control"), "public, max-age=300");
    const publicCatalog = await publicCatalogResponse.json(); assert.deepEqual(publicCatalog.guides.map(g => g.slug), ["bangkok", "hong-kong", "london", "paris", "istanbul"]);
    const publicGuide = await json("/api/mobile/public?guide=paris"); assert.equal(publicGuide.days.length, 4); assert.ok(publicGuide.days[0].stops.length);
    assert.equal((await fetch(origin + "/api/mobile/public?screen=admin")).status, 400);
    assert.equal((await fetch(origin + "/api/mobile/public?guide=private-trip")).status, 404);
    assert.equal((await fetch(origin + "/api/mobile/public", { method: "POST" })).status, 405);
    const signupPage = await fetch(origin + "/sign-up"); assert.equal(signupPage.status, 200);
    const signup = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: "Hosting check", email: `hosting-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() + "Aa1!" }) });
    assert.equal(signup.status, 200, await signup.clone().text());
    const cookie = signup.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
    assert.ok(cookie);
    for (const path of ["/plans", "/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter", "/examples", "/examples/lisbon-porto", "/contact", "/terms", "/privacy", "/refunds"]) {
      const tab = await fetch(origin + path, { headers: { Cookie: cookie } }); assert.equal(tab.status, 200, path); assertMemberNavigation(await tab.text());
    }
    const memberGuide = await (await fetch(origin + "/examples/paris", { headers: { Cookie: cookie } })).text();
    assertMemberNavigation(memberGuide);
    assert.match(memberGuide, /id="copy-date"/); assert.match(memberGuide, /Save a copy to my trips/);
    const returnToGuide = await fetch(origin + "/sign-in?next=%2Fexamples%2Fparis%23use-itinerary", { headers: { Cookie: cookie }, redirect: "manual" });
    assert.equal(returnToGuide.status, 307); assert.equal(returnToGuide.headers.get("Location"), "/examples/paris#use-itinerary");
    for (const path of ["/api/mobile/session", "/api/mobile/trips", "/api/mobile/destinations", "/api/mobile/trips/not-a-member", "/api/mobile/workspace?screen=trips", "/api/mobile/files?tripId=private&kind=json", "/api/mobile/location?tripId=private"]) {
      const anonymous = await fetch(origin + path); assert.equal(anonymous.status, 401, path);
      assert.equal(anonymous.headers.get("Cache-Control"), "private, no-store");
    }
    const mobileSession = await json("/api/mobile/session", { headers: { Cookie: cookie } });
    assert.equal(mobileSession.name, "Hosting check");
    assert.deepEqual(await json("/api/mobile/trips", { headers: { Cookie: cookie } }), { trips: [] });
    assert.deepEqual(await json("/api/mobile/destinations", { headers: { Cookie: cookie } }), { searches: [] });
    assert.equal((await fetch(origin + "/api/mobile/trips/not-a-member", { headers: { Cookie: cookie } })).status, 404);
    const nativeSignup = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", "expo-origin": "tripanize://" }, body: JSON.stringify({ name: "Native mobile check", email: `native-${crypto.randomUUID()}@example.test`, password: crypto.randomUUID() + "Aa1!" }) });
    assert.equal(nativeSignup.status, 200, await nativeSignup.clone().text());
    const nativeCookie = nativeSignup.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.ok(nativeCookie);
    assert.equal((await json("/api/mobile/session", { headers: { Cookie: nativeCookie } })).name, "Native mobile check");
    const nativeCommand = (action, tripId, values = {}) => json("/api/mobile/workspace", { method: "POST", headers: { Cookie: nativeCookie, Origin: "tripanize://", "Content-Type": "application/json" }, body: JSON.stringify({ action, ...(tripId ? { tripId } : {}), values }) });
    const copiedExample = await nativeCommand("example.copy", undefined, { slug: "paris", startDate: "2027-05-01" });
    const copiedTrip = await json(`/api/mobile/trips/${copiedExample.to.tripId}`, { headers: { Cookie: nativeCookie } });
    assert.equal(copiedTrip.days.length, 4); assert.equal(copiedTrip.trip.premium, false);
    assert.equal((await fetch(origin + `/api/mobile/trips/${copiedExample.to.tripId}`)).status, 401);
    await nativeCommand("trip.delete", copiedExample.to.tripId, { name: copiedTrip.trip.name });
    const mobileDraft = await nativeCommand("trip.create", undefined, { name: "Isolated mobile trip" });
    const nativeTripId = mobileDraft.to.tripId;
    await nativeCommand("trip.standard", nativeTripId);
    const detailsDoc = await json(`/api/mobile/workspace?screen=setup&tripId=${nativeTripId}`, { headers: { Cookie: nativeCookie } });
    const detailsForm = detailsDoc.blocks.find(block => block.form?.action === "trip.details").form;
    await nativeCommand("trip.details", nativeTripId, { ...detailsForm.values, name: "Isolated mobile trip", startDate: "2027-05-01", endDate: "2027-05-04", timezone: "Europe/Paris", destinations: [{ name: "Paris", country: "France" }], currency: "EUR", budget: "500" });
    await nativeCommand("setup.manual", nativeTripId);
    const itinerary = await json(`/api/mobile/trips/${nativeTripId}`, { headers: { Cookie: nativeCookie } });
    await nativeCommand("stop.save", nativeTripId, { title: "Mobile manual stop", dayId: itinerary.days[0].id, plan: "A" });
    const workspaceDoc = await json(`/api/mobile/workspace?screen=itinerary&tripId=${nativeTripId}&item=${itinerary.days[0].id}`, { headers: { Cookie: nativeCookie } });
    assert.ok(workspaceDoc.blocks.some(block => block.title === "Mobile manual stop"));
    assert.equal(workspaceDoc.tabs.length, 6);
    const deniedMobileEdit = await fetch(origin + "/api/mobile/workspace", { method: "POST", headers: { Cookie: nativeCookie, Origin: "https://attacker.test", "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop.save", tripId: nativeTripId, values: { title: "Rejected" } }) });
    assert.equal(deniedMobileEdit.status, 403);
    const privateExport = await fetch(origin + `/api/mobile/files?tripId=${nativeTripId}&kind=json`, { headers: { Cookie: nativeCookie } });
    assert.equal(privateExport.status, 200); assert.equal(privateExport.headers.get("Cache-Control"), "private, no-store");
    assert.equal((await privateExport.json()).trip.name, "Isolated mobile trip");
    const lockedWorkspace = await json(`/api/mobile/workspace?screen=expenses&tripId=${nativeTripId}`, { headers: { Cookie: nativeCookie } });
    assert.equal(lockedWorkspace.blocks[0].id, "locked");
    await nativeCommand("trip.delete", nativeTripId, { name: "Isolated mobile trip" });
    const badNativeOrigin = await fetch(origin + "/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json", "expo-origin": "other-app://" }, body: JSON.stringify({ email: "nobody@example.test", password: "No account was created" }) });
    assert.equal(badNativeOrigin.status, 403);
    const mobilePreview = await fetch(origin + "/mobile-preview/trips"); assert.equal(mobilePreview.status, 200); assert.equal(new URL(mobilePreview.url).pathname, "/mobile-preview/trips"); assert.match(await mobilePreview.text(), /noindex,nofollow/);
    for (const path of ["/", "/sign-in", "/sign-up"]) {
      const landing = await fetch(origin + path, { headers: { Cookie: cookie } });
      assert.equal(new URL(landing.url).pathname, "/start", path);
      const landingHtml = await landing.text();
      assertMemberNavigation(landingHtml);
      assert.match(landingHtml, /I have a destination/);
      assert.match(landingHtml, /Help me choose/);
      assert.match(landingHtml, /href="\/destinations"/);
      assert.doesNotMatch(landingHtml, /Search trips/);
    }
    const directAccount = await fetch(origin + "/sign-in?next=%2Faccount", { headers: { Cookie: cookie } }); assert.equal(new URL(directAccount.url).pathname, "/account"); assertMemberNavigation(await directAccount.text());
    const destinationPage = await fetch(origin + "/destinations", { headers: { Cookie: cookie } }); assert.equal(new URL(destinationPage.url).pathname, "/destinations"); const destinationHtml = await destinationPage.text(); assert.match(destinationHtml, /Saved searches/); assertMemberNavigation(destinationHtml);
    const privateDiscovery = await fetch(origin + "/destinations"); assert.equal(new URL(privateDiscovery.url).pathname, "/sign-in");
    const trips = await fetch(origin + "/trips", { headers: { Cookie: cookie } }); assert.equal(trips.status, 200); assert.equal(new URL(trips.url).pathname, "/trips"); const tripsHtml = await trips.text(); assert.match(tripsHtml, /trips/i); assert.doesNotMatch(tripsHtml, /Choose how to start|Saved searches/);
    const newTrip = await fetch(origin + "/trips/new", { headers: { Cookie: cookie } }); assert.equal(newTrip.status, 200); assert.equal(new URL(newTrip.url).pathname, "/trips/new");
    assertMemberNavigation(tripsHtml); assertMemberNavigation(await newTrip.text());
    for (const path of ["/settings", "/notifications"]) {
      const page = await fetch(origin + path, { headers: { Cookie: cookie } }); assert.equal(page.status, 200, path); assertMemberNavigation(await page.text());
    }
    const deniedCompany = await fetch(origin + "/company", { headers: { Cookie: cookie } }); assert.equal(deniedCompany.status, 404);
    const unverifiedTrial = await fetch(origin + "/trial?invitation=not-yours", { headers: { Cookie: cookie } }); assert.equal(unverifiedTrial.status, 200); assert.match(await unverifiedTrial.text(), /Verify your invited email/);
    const reauth = await fetch(origin + "/sign-in?reauth=1&next=%2Faccount", { headers: { Cookie: cookie } }); assert.equal(new URL(reauth.url).pathname, "/sign-in"); assert.match(await reauth.text(), /Sign in/);
    const companySignup = await fetch(origin + "/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ name: "Retired personal label", email: "company@example.test", password: crypto.randomUUID() + "Aa1!" }) });
    assert.equal(companySignup.status, 200, await companySignup.clone().text());
    const companyUser = await companySignup.json(); assert.equal(companyUser.user.name, "Joe Daniel Hadchity"); assert.equal(companyUser.user.emailVerified, false);
    const companyCookie = companySignup.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    assert.equal((await fetch(origin + "/company", { headers: { Cookie: companyCookie } })).status, 404);
    const changedName = await fetch(origin + "/api/auth/update-user", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: companyCookie }, body: JSON.stringify({ name: "Another personal label" }) }); assert.equal(changedName.status, 200);
    const companyAccountHtml = await (await fetch(origin + "/account", { headers: { Cookie: companyCookie } })).text(); assert.match(companyAccountHtml, /Joe Daniel Hadchity/); assert.doesNotMatch(companyAccountHtml, /Another personal label|Retired personal label/);
    const unauth = await fetch(origin + "/api/attachments/does-not-exist"); assert.equal(unauth.status, 401);
    const coverUnauth = await fetch(origin + "/api/trips/does-not-exist/cover"); assert.equal(coverUnauth.status, 401);
    const coverMissing = await fetch(origin + "/api/trips/does-not-exist/cover", { headers: { Cookie: cookie } }); assert.equal(coverMissing.status, 404);
    const locationUnauth = await fetch(origin + "/api/trips/does-not-exist/locations"); assert.equal(locationUnauth.status, 401); assert.equal(locationUnauth.headers.get("Cache-Control"), "private, no-store");
    const locationMissing = await fetch(origin + "/api/trips/does-not-exist/locations", { headers: { Cookie: cookie } }); assert.equal(locationMissing.status, 404);
    const locationCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/locations", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ op: "stop" }) }); assert.equal(locationCrossOrigin.status, 403);
    const chatUnauth = await fetch(origin + "/api/trips/does-not-exist/chat"); assert.equal(chatUnauth.status, 401); assert.equal(chatUnauth.headers.get("Cache-Control"), "private, no-store");
    const chatMissing = await fetch(origin + "/api/trips/does-not-exist/chat", { headers: { Cookie: cookie } }); assert.equal(chatMissing.status, 404);
    const chatCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/chat", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ op: "read", seq: 1 }) }); assert.equal(chatCrossOrigin.status, 403);
    const assistantUnauth = await fetch(origin + "/api/trips/does-not-exist/assistant"); assert.equal(assistantUnauth.status, 401); assert.equal(assistantUnauth.headers.get("Cache-Control"), "private, no-store");
    const assistantMissing = await fetch(origin + "/api/trips/does-not-exist/assistant", { headers: { Cookie: cookie } }); assert.equal(assistantMissing.status, 404);
    const assistantCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/assistant", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ op: "apply", id: "not-a-proposal" }) }); assert.equal(assistantCrossOrigin.status, 403);
    const modeCrossOrigin = await fetch(origin + "/api/account/mode", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ mode: "NORMAL" }) }); assert.equal(modeCrossOrigin.status, 403);
    const modeUnauth = await fetch(origin + "/api/account/mode", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "ADMIN" }) }); assert.equal(modeUnauth.status, 401);
    const ordinaryMode = await fetch(origin + "/api/account/mode", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ mode: "ADMIN" }) }); assert.equal(ordinaryMode.status, 403);
    const unverifiedMode = await fetch(origin + "/api/account/mode", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: companyCookie }, body: JSON.stringify({ mode: "NORMAL" }) }); assert.equal(unverifiedMode.status, 403);
    const securityPost = (cookie, extra = {}) => fetch(origin + "/api/account/security", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extra }, body: JSON.stringify({ op: "enroll" }) });
    assert.equal((await securityPost()).status, 401);
    assert.equal((await securityPost(cookie)).status, 403);
    assert.equal((await securityPost(companyCookie)).status, 403);
    assert.equal((await securityPost(cookie, { Origin: "https://outside.example" })).status, 403);
    assert.equal((await fetch(origin + "/account/security", { headers: { Cookie: cookie } })).status, 404);
    const ordinaryAccount = await (await fetch(origin + "/account", { headers: { Cookie: cookie } })).text(); assert.doesNotMatch(ordinaryAccount, /Switching mode|Account mode|Normal mode/);
    const receiptUnauth = await fetch(origin + "/api/trips/does-not-exist/expenses", { method: "POST", headers: { Origin: origin, "Content-Type": "multipart/form-data; boundary=test" }, body: "--test--" });
    assert.equal(receiptUnauth.status, 401); assert.equal(receiptUnauth.headers.get("Cache-Control"), "private, no-store");
    const receiptCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/expenses", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "multipart/form-data; boundary=test", Cookie: cookie }, body: "--test--" });
    assert.equal(receiptCrossOrigin.status, 403);
    const receiptMissingTrip = await fetch(origin + "/api/trips/does-not-exist/expenses", { method: "POST", headers: { Origin: origin, "Content-Type": "multipart/form-data; boundary=test", Cookie: cookie }, body: "--test--" });
    assert.equal(receiptMissingTrip.status, 404);
    const scanCrossOrigin = await fetch(origin + "/api/trips/does-not-exist/receipts/scan", { method: "POST", headers: { Origin: "https://outside.example", "Content-Type": "multipart/form-data; boundary=test", Cookie: cookie }, body: "--test--" }); assert.equal(scanCrossOrigin.status, 403);
    const scanUnauth = await fetch(origin + "/api/trips/does-not-exist/receipts/scan", { method: "POST", headers: { Origin: origin, "Content-Type": "multipart/form-data; boundary=test" }, body: "--test--" }); assert.equal(scanUnauth.status, 401); assert.equal(scanUnauth.headers.get("Cache-Control"), "private, no-store");
    const scanMissing = await fetch(origin + "/api/trips/does-not-exist/receipts/scan", { method: "POST", headers: { Origin: origin, "Content-Type": "multipart/form-data; boundary=test", Cookie: cookie }, body: "--test--" }); assert.equal(scanMissing.status, 404);
    const votesMissing = await fetch(origin + "/trips/does-not-exist/votes", { headers: { Cookie: cookie } }); assert.equal(votesMissing.status, 404);
    await stop(child); child = await start();
    const restored = await fetch(origin + "/trips", { headers: { Cookie: cookie } }); assert.equal(restored.status, 200); assert.equal(new URL(restored.url).pathname, "/trips");
    const signout = await fetch(origin + "/api/auth/sign-out", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie }, body: "{}" });
    assert.equal(signout.status, 200);
    // A browser can retain a signed cookie after its session is deleted/expired.
    // Public invite pages must still render instead of failing before the router.
    for (const path of ["/invite/expired-session-check", "/trial/expired-session-check", "/sign-in"]) {
      const staleSession = await fetch(origin + path, { headers: { Cookie: cookie } });
      assert.equal(staleSession.status, 200, `stale session: ${path}`);
      assert.doesNotMatch(await staleSession.text(), /cookies\(\) can only be called|Worker threw exception/);
    }
    console.log(JSON.stringify({ mode, nativeHomePublicContent: true, nativeWorkspace: true, memberMainNavigation: true, staleSessionInviteGuard: true, companyAdminGuard: true, personalTravelerName: true, publicBrandUnchanged: true, reauthAvailable: true, home: 200, signup: 200, authenticatedTrips: 200, newTripForm: 200, privateFileGuard: 401, tripCoverGuard: true, staticAssets: true, sessionSurvivesRestart: true, aiConnected: false }));
  }
} catch (error) { await new Promise((resolve) => setTimeout(resolve, 200)); console.error(error.stack ?? error.message); console.error(logs.slice(-11000)); process.exitCode = 1; }
finally { if (child) await stop(child); }

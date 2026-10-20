import { chromium } from "@playwright/test";
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
const errors = [];
page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errors.push(`[${page.url().replace(base, "")}] ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => errors.push(`[pageerror ${page.url()}] ${e.message.slice(0, 300)}`));
await page.goto(`${base}/sign-up`);
await page.fill("#name", "Console");
await page.fill("#email", `console${Date.now()}@example.test`);
await page.fill("#password", "a-long-test-password");
await page.click("button[type=submit]");
await page.waitForURL("**/trips");
await page.goto(`${base}/trips/new`);
await page.fill("#name", "Console trip");
await page.fill("#startDate", "2026-10-19");
await page.fill("#endDate", "2026-10-22");
await page.fill("#dest-0", "Lisbon");
await page.click("button[type=submit]");
await page.waitForURL("**/plan?start=1");
const t = page.url().replace(/\/plan.*$/, "");
for (const s of ["itinerary", "today", "bookings", "expenses", "packing", "events", "settings"]) { await page.goto(`${t}/${s}`); await page.waitForTimeout(1500); }
for (const s of ["/account", "/trips", "/examples/lisbon-porto", "/offline"]) { await page.goto(base + s); await page.waitForTimeout(1000); }
console.log(errors.join("\n") || "no console errors");
await browser.close();

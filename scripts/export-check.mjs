import { chromium } from "@playwright/test";
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${base}/sign-up`);
await page.fill("#name", "Exporter"); await page.fill("#email", `exp${Date.now()}@example.test`); await page.fill("#password", "a-long-test-password");
await page.click("button[type=submit]"); await page.waitForURL("**/trips");
await page.goto(`${base}/trips/new`);
await page.fill("#name", "Kraków & Łódź"); await page.fill("#startDate", "2027-05-01"); await page.fill("#endDate", "2027-05-02"); await page.fill("#dest-0", "Kraków");
await page.click("button[type=submit]"); await page.waitForURL("**/plan?start=1");
const t = page.url().replace(/\/plan.*$/, "").replace(base, "");
for (const p of ["export/pdf", "export/pdf?date=2027-05-01", "export/json", "snapshot", "revision"]) {
  const r = await ctx.request.get(`${base}/api${t}/${p}`);
  const b = await r.body();
  console.log(p, r.status(), r.headers()["content-type"], b.length, p.includes("pdf") ? b.subarray(0, 5).toString() : "");
}
const anon = await browser.newContext();
console.log("anon pdf", (await anon.request.get(`${base}/api${t}/export/pdf`)).status());
await browser.close();

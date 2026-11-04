import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { openAiCostCheck, parseCostBuckets } from "@/server/admin/openai-costs";
import { adminAuthenticationFixture, makeUser, resetDb } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, companyAdminEmail: "admin@example.test" }); });
afterEach(() => { setTestRuntime(runtime); vi.unstubAllEnvs(); });

const now = new Date("2030-06-10T12:00:00Z");
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;
async function admin() {
  const a = await makeUser("Administrator", "admin@example.test");
  await prisma.user.update({ where: { id: a.id }, data: { emailVerified: true } });
  await adminAuthenticationFixture(a.id);
  return a;
}
function bill(body: unknown, seen?: string[]) {
  return (async (url: URL | string, init?: RequestInit) => {
    seen?.push(String(url), String((init?.headers as Record<string, string>)?.Authorization));
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}
async function spend(userId: string, credits: number, at: string) {
  await prisma.creditEntry.create({ data: { userId, amount: -credits, kind: "spend", note: "plan", createdAt: new Date(at) } });
}

it("adds up each day's USD cost results from OpenAI's daily buckets", () => {
  expect(parseCostBuckets({ data: [
    { object: "bucket", start_time: day("2030-06-09"), end_time: day("2030-06-10"), results: [{ object: "organization.costs.result", amount: { value: 0.75, currency: "usd" }, line_item: "input" }, { amount: { value: "0.25", currency: "usd" } }] },
    { object: "bucket", start_time: day("2030-06-10"), end_time: day("2030-06-11"), results: [] },
  ] })).toEqual([{ date: "2030-06-09", usd: 1 }, { date: "2030-06-10", usd: 0 }]);
  expect(parseCostBuckets(null)).toEqual([]);
});

it("compares the OpenAI bill with credits spent per day, and flags days that cost more than credits cover", async () => {
  vi.stubEnv("OPENAI_ADMIN_KEY", "fixture-admin-key");
  const a = await admin(); const user = await makeUser("Traveler");
  await spend(user.id, 100, "2030-06-08T10:00:00Z"); // $1.50 bill → 1.5¢ a credit: fine
  await spend(user.id, 50, "2030-06-09T10:00:00Z");  // $1.50 bill → 3¢: above the 2¢ target
  await spend(user.id, 10, "2030-06-10T10:00:00Z");  // $2.00 bill → 20¢: more than a credit brings in
  const seen: string[] = [];
  const fetcher = bill({ has_more: false, next_page: null, data: [
    { start_time: day("2030-06-08"), results: [{ amount: { value: 1.5, currency: "usd" } }] },
    { start_time: day("2030-06-09"), results: [{ amount: { value: 1.5, currency: "usd" } }] },
    { start_time: day("2030-06-10"), results: [{ amount: { value: 2, currency: "usd" } }] },
    { start_time: day("2030-06-07"), results: [{ amount: { value: 0.4, currency: "usd" } }] },
  ] }, seen);
  const check = await openAiCostCheck(a.id, { fetcher, now });
  expect(seen[0]).toContain("https://api.openai.com/v1/organization/costs?start_time=");
  expect(seen[1]).toBe("Bearer fixture-admin-key");
  expect(check.rows.map(r => [r.date, r.status])).toEqual([["2030-06-10", "losing"], ["2030-06-09", "above-target"], ["2030-06-08", "ok"], ["2030-06-07", "no-credits"]]);
  expect(check.totals).toMatchObject({ openAiUsd: 5.4, creditsSpent: 160 });
  // Cached for an hour: a second look doesn't call OpenAI again.
  const again = await openAiCostCheck(a.id, { fetcher: bill({ data: [] }), now: new Date(now.getTime() + 10 * 60_000) });
  expect(again.totals.openAiUsd).toBe(5.4);
});

it("explains a refused key and falls back to Tripanize's own estimate", async () => {
  vi.stubEnv("OPENAI_ADMIN_KEY", "wrong-key");
  const a = await admin();
  const refused = (async () => new Response("{}", { status: 401 })) as typeof fetch;
  const check = await openAiCostCheck(a.id, { fetcher: refused, now, refresh: true });
  expect(check.error).toMatch(/refused the admin key/);
  expect(check.totals.openAiUsd).toBeNull();
});

it("works without an admin key, and only for the administrator", async () => {
  const a = await admin(); const other = await makeUser("Traveler");
  const check = await openAiCostCheck(a.id, { now });
  expect(check).toMatchObject({ configured: false, error: null, rows: [] });
  await expect(openAiCostCheck(other.id, { now })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

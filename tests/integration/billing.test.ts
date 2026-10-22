import { createHmac } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { getTripPlan } from "@/server/plans/access";
import { beginCheckout, billingSummary, recordVerifiedTransaction, refreshTripPayment } from "@/server/billing/service";
import { verifyPaddleSignature, receivePaddleWebhook } from "@/server/billing/webhook";
import type { PaddleTransaction } from "@/server/billing/paddle";
import { checkoutAvailable } from "@/server/billing/config";
import { transferOwnership, addTraveler } from "@/server/invitations/service";
import { makeTrip, makeUser, resetDb } from "./helpers";
const runtime = currentRuntime();
const price = (n: number) => `pri_${String(n).padStart(26, "0")}`;
const txn = (n: number) => `txn_${String(n).padStart(26, "0")}`;
const config = { environment: "sandbox" as const, apiKey: "isolated-not-real", clientToken: `test_${"a".repeat(27)}`, webhookSecret: "isolated-webhook-secret", checkoutEnabled: true, prices: Object.fromEntries([600, 900, 1000, 1500, 1600, 2500].map(n => [n, price(n)])) };
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true, paddle: config }); });
afterEach(() => { setTestRuntime(runtime); vi.unstubAllGlobals(); });
async function setup(people = 2) { const owner = await makeUser("Owner"); const tripId = await makeTrip(owner.id, { adults: people }); return { owner, tripId }; }
it("keeps checkout unavailable for truncated, wrong-environment or accidentally appended client tokens", () => {
  for (const environment of ["sandbox", "live"] as const) {
    const token = `${environment === "sandbox" ? "test" : "live"}_${"a".repeat(27)}`;
    setTestRuntime({ ...runtime, paddle: { ...config, environment, clientToken: token } });
    expect(checkoutAvailable()).toBe(true);
    for (const clientToken of [token.slice(0, -1), `${token}Active`, token.replace(environment === "sandbox" ? "test_" : "live_", environment === "sandbox" ? "live_" : "test_")]) {
      setTestRuntime({ ...runtime, paddle: { ...config, environment, clientToken } });
      expect(checkoutAvailable()).toBe(false);
    }
  }
});
function transaction(checkoutId: string, tripId: string, amount: number, n = 1, status = "completed"): PaddleTransaction {
  return { id: txn(n), status, currency_code: "USD", subscription_id: null, discount_id: null, custom_data: { checkoutId, tripId, environment: "sandbox" }, items: [{ quantity: 1, price: { id: price(amount), billing_cycle: null, unit_price: { amount: String(amount), currency_code: "USD" } } }], details: { totals: { subtotal: String(amount), discount: "0" } }, adjustments: [] };
}
async function paid(tripId: string, ownerId: string, amount: number, n = 1) {
  const row = await prisma.premiumCheckout.create({ data: { tripId, buyerId: ownerId, environment: "sandbox", priceId: price(amount), amountMinor: amount, targetCapacity: amount === 900 ? 2 : amount === 1500 ? 6 : 12 } });
  const data = transaction(row.id, tripId, amount, n); await recordVerifiedTransaction(data); return data;
}
it("prices boundaries, counts organizer/planned children/non-account travelers, and quotes only the upgrade difference", async () => {
  const { owner, tripId } = await setup();
  expect((await billingSummary(owner.id, tripId)).recommended).toBe("small");
  await paid(tripId, owner.id, 900);
  await addTraveler(owner.id, tripId, "Third traveler", true);
  let summary = await billingSummary(owner.id, tripId);
  expect(summary).toMatchObject({ people: 3, premium: false, creditMinor: 900, recommended: "medium" });
  expect(summary.options.find(b => b.id === "medium")?.dueMinor).toBe(600);
  await paid(tripId, owner.id, 600, 2);
  expect(await getTripPlan(tripId)).toMatchObject({ premium: true, capacity: 6, creditMinor: 1500 });
  await prisma.trip.update({ where: { id: tripId }, data: { adults: 6, children: 1 } });
  summary = await billingSummary(owner.id, tripId);
  expect(summary).toMatchObject({ people: 7, recommended: "large", premium: false });
  expect(summary.options.find(b => b.id === "large")?.dueMinor).toBe(1000);
  await prisma.trip.update({ where: { id: tripId }, data: { adults: 12, children: 0 } });
  expect((await billingSummary(owner.id, tripId)).recommended).toBe("large");
  await prisma.trip.update({ where: { id: tripId }, data: { adults: 13 } });
  expect((await billingSummary(owner.id, tripId)).recommended).toBeNull();
});
it("keeps purchases on one trip, survives ownership transfer, and isolates sandbox from live", async () => {
  const { owner, tripId } = await setup(); const otherTrip = await makeTrip(owner.id); const member = await makeUser("Member");
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await paid(tripId, owner.id, 1500);
  expect((await getTripPlan(otherTrip)).premium).toBe(false);
  await transferOwnership(owner.id, tripId, member.id);
  expect((await getTripPlan(tripId)).premium).toBe(true);
  await expect(beginCheckout(owner.id, tripId, "large")).rejects.toMatchObject({ code: "FORBIDDEN" });
  setTestRuntime({ ...runtime, planAccessEnabled: true, paddle: { ...config, environment: "live" } });
  expect((await getTripPlan(tripId)).premium).toBe(false);
});
it("reuses pending checkout, sends the server's fixed price, denies under-sized purchases and requires owner", async () => {
  const { owner, tripId } = await setup(3); const outsider = await makeUser("Outsider");
  const fetchMock = vi.fn(async (_url: string, opts?: RequestInit) => {
    const input = opts?.body ? JSON.parse(String(opts.body)) : null;
    const row = await prisma.premiumCheckout.findFirstOrThrow({ where: { tripId } });
    if (input) { expect(input.items).toEqual([{ price_id: price(1500), quantity: 1 }]); expect(input.custom_data.checkoutId).toBe(row.id); }
    return Response.json({ data: transaction(row.id, tripId, 1500, 1, "ready") });
  }); vi.stubGlobal("fetch", fetchMock);
  await expect(beginCheckout(outsider.id, tripId, "medium")).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(beginCheckout(owner.id, tripId, "small")).rejects.toMatchObject({ code: "VALIDATION" });
  expect(fetchMock).not.toHaveBeenCalled();
  const first = await beginCheckout(owner.id, tripId, "medium");
  const next = await beginCheckout(owner.id, tripId, "large");
  expect(first.transactionId).toBe(next.transactionId);
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect((await getTripPlan(tripId)).premium).toBe(false);
});
it("makes completed deliveries idempotent and rejects modified currency, price, amount, quantity, discounts and trip", async () => {
  const { owner, tripId } = await setup(); const data = await paid(tripId, owner.id, 900);
  await recordVerifiedTransaction(data); await recordVerifiedTransaction(data);
  expect((await getTripPlan(tripId)).creditMinor).toBe(900);
  const cases = [ { ...data, currency_code: "EUR" }, { ...data, subscription_id: "sub_bad" }, { ...data, discount_id: "dsc_bad" }, { ...data, custom_data: { ...data.custom_data, tripId: "other" } }, { ...data, items: [{ ...data.items[0], quantity: 2 }] }, { ...data, details: { totals: { subtotal: "1", discount: "0" } } } ];
  for (const item of cases) await expect(recordVerifiedTransaction(item)).rejects.toMatchObject({ code: "VALIDATION" });
  expect((await getTripPlan(tripId)).creditMinor).toBe(900);
});
it("revokes adjusted credit while keeping the trip and blocks accidental repurchase until reviewed", async () => {
  const { owner, tripId } = await setup(); const data = await paid(tripId, owner.id, 900);
  await recordVerifiedTransaction({ ...data, adjustments: [{ action: "refund", status: "approved" }] });
  expect(await getTripPlan(tripId)).toMatchObject({ premium: false, reviewRequired: true });
  await expect(beginCheckout(owner.id, tripId, "small")).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await prisma.trip.count()).toBe(1);
  await recordVerifiedTransaction({ ...data, adjustments: [{ action: "refund", status: "reversed" }] });
  expect((await getTripPlan(tripId)).premium).toBe(true);
});
it("verifies raw-body HMAC, rejects stale/future/modified signatures, and retries against current Paddle state", async () => {
  const { owner, tripId } = await setup(); const data = await paid(tripId, owner.id, 900);
  const raw = JSON.stringify({ event_id: "evt_isolated", event_type: "transaction.completed", data: { id: data.id } });
  const ts = Math.floor(Date.now() / 1000); const signature = (time: number) => `ts=${time};h1=${createHmac("sha256", config.webhookSecret).update(`${time}:${raw}`).digest("hex")}`;
  expect(verifyPaddleSignature(raw, signature(ts), config.webhookSecret)).toBe(true);
  expect(verifyPaddleSignature(raw + " ", signature(ts), config.webhookSecret)).toBe(false);
  expect(verifyPaddleSignature(raw, signature(ts - 60), config.webhookSecret)).toBe(false);
  expect(verifyPaddleSignature(raw, signature(ts + 60), config.webhookSecret)).toBe(false);
  await expect(receivePaddleWebhook(raw, "ts=1;h1=bad")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  const fetchMock = vi.fn(async () => Response.json({ data })); vi.stubGlobal("fetch", fetchMock);
  await receivePaddleWebhook(raw, signature(ts)); await receivePaddleWebhook(raw, signature(ts));
  expect(fetchMock).toHaveBeenCalledTimes(2); expect((await getTripPlan(tripId)).creditMinor).toBe(900);
});
it("keeps an ambiguous create failure blocked so retries cannot create duplicate transactions", async () => {
  const { owner, tripId } = await setup(); const fetchMock = vi.fn(async () => { throw new Error("network interrupted"); }); vi.stubGlobal("fetch", fetchMock);
  await expect(beginCheckout(owner.id, tripId, "small")).rejects.toMatchObject({ code: "UPSTREAM" });
  await expect(beginCheckout(owner.id, tripId, "small")).rejects.toMatchObject({ code: "CONFLICT" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("acknowledges signed simulations and unrelated payments without a provider request or granting access", async () => {
  const { owner, tripId } = await setup();
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  for (const environment of ["sandbox", "live"]) {
    setTestRuntime({ ...runtime, planAccessEnabled: true, paddle: { ...config, environment: environment as "sandbox" | "live" } });
    const raw = JSON.stringify({ event_id: "evt_simulation", event_type: "transaction.completed", data: { id: txn(99), custom_data: { checkoutId: "unrelated-purchase" } } });
    const ts = Math.floor(Date.now() / 1000);
    const signature = `ts=${ts};h1=${createHmac("sha256", config.webhookSecret).update(`${ts}:${raw}`).digest("hex")}`;
    await receivePaddleWebhook(raw, signature);
    expect((await getTripPlan(tripId)).premium).toBe(false);
  }
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await prisma.premiumCheckout.count()).toBe(0);
});
it("recovers an interrupted checkout create only after matching the authoritative provider transaction", async () => {
  const { owner, tripId } = await setup();
  const row = await prisma.premiumCheckout.create({ data: { tripId, buyerId: owner.id, environment: "sandbox", priceId: price(900), amountMinor: 900, targetCapacity: 2 } });
  const data = transaction(row.id, tripId, 900);
  const raw = JSON.stringify({ event_id: "evt_recovery", event_type: "transaction.completed", data: { id: data.id, custom_data: data.custom_data } });
  const ts = Math.floor(Date.now() / 1000); const signature = `ts=${ts};h1=${createHmac("sha256", config.webhookSecret).update(`${ts}:${raw}`).digest("hex")}`;
  const fetchMock = vi.fn(async () => Response.json({ data })); vi.stubGlobal("fetch", fetchMock);
  await receivePaddleWebhook(raw, signature);
  expect((await getTripPlan(tripId)).creditMinor).toBe(900);
  expect((await prisma.premiumCheckout.findUniqueOrThrow({ where: { id: row.id } })).transactionId).toBe(data.id);
});
it("manual status checks reconcile completed purchases too, catching an adjustment whose webhook was missed", async () => {
  const { owner, tripId } = await setup(); const data = await paid(tripId, owner.id, 900);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: { ...data, adjustments: [{ action: "refund", status: "approved" }] } })));
  expect(await refreshTripPayment(owner.id, tripId)).toMatchObject({ premium: false, reviewRequired: true, creditMinor: 0 });
});

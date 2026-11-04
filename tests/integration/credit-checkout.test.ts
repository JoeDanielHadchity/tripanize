import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { getTripPlan } from "@/server/plans/access";
import { recordVerifiedTransaction } from "@/server/billing/service";
import { beginCreditCheckout, recordCreditTransaction, refreshCreditPayments } from "@/server/billing/credits";
import { receivePaddleWebhook } from "@/server/billing/webhook";
import { creditCheckoutAvailable, paddleConfigFromEnv } from "@/server/billing/config";
import type { PaddleTransaction } from "@/server/billing/paddle";
import { balance } from "@/server/credits/service";
import { makeTrip, makeUser, resetDb } from "./helpers";

const runtime = currentRuntime();
const price = (n: number) => `pri_${String(n).padStart(26, "0")}`;
const txn = (n: number) => `txn_${String(n).padStart(26, "0")}`;
const config = { environment: "sandbox" as const, apiKey: "isolated-not-real", clientToken: `test_${"a".repeat(27)}`, webhookSecret: "isolated-webhook-secret", checkoutEnabled: true,
  prices: { 1500: price(1500) }, creditPrices: Object.fromEntries([500, 1500, 2500, 5000].map(n => [n, price(n + 1)])) };
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true, creditsEnabled: true, paddle: config }); });
afterEach(() => { setTestRuntime(runtime); vi.unstubAllGlobals(); });

async function buyer() { const u = await makeUser("Buyer"); return prisma.user.update({ where: { id: u.id }, data: { emailVerified: true } }); }
function tx(checkoutId: string, amount: number, priceId: string, n: number, opts: { tripId?: string; kind?: "credits"; status?: string; adjustments?: { action: string; status: string }[] } = {}): PaddleTransaction {
  return { id: txn(n), status: opts.status ?? "completed", currency_code: "USD", subscription_id: null, discount_id: null, custom_data: { checkoutId, tripId: opts.tripId ?? "", environment: "sandbox", ...(opts.kind ? { kind: opts.kind } : {}) },
    items: [{ quantity: 1, price: { id: priceId, billing_cycle: null, unit_price: { amount: String(amount), currency_code: "USD" } } }], details: { totals: { subtotal: String(amount), discount: "0" } }, adjustments: opts.adjustments ?? [] };
}
async function bundle(userId: string, id: "topup" | "starter" | "plus" | "pro", amount: number, credits: number, tripId: string | null = null) {
  return prisma.creditCheckout.create({ data: { buyerId: userId, bundle: id, credits, tripId, environment: "sandbox", priceId: price(amount + 1), amountMinor: amount } });
}

it("only offers bundles once every bundle has its Paddle price", () => {
  expect(creditCheckoutAvailable()).toBe(true);
  setTestRuntime({ ...runtime, paddle: { ...config, creditPrices: { 500: price(501) } } });
  expect(creditCheckoutAvailable()).toBe(false);
});

it("reads sandbox keys beside the live ones, so switching is one setting", () => {
  const env = { PADDLE_ENVIRONMENT: "sandbox", PADDLE_API_KEY: "live-key", PADDLE_SANDBOX_API_KEY: "sandbox-key", PADDLE_CLIENT_TOKEN: "live_tok", PADDLE_CREDITS_PRICE_500: "pri_live", PADDLE_SANDBOX_CREDITS_PRICE_500: "pri_sandbox", PADDLE_PRICE_1500: "pri_premium_live" } as unknown as CloudflareEnv;
  expect(paddleConfigFromEnv(env)).toMatchObject({ environment: "sandbox", apiKey: "sandbox-key", clientToken: "live_tok", creditPrices: { 500: "pri_sandbox" }, prices: { 1500: "pri_premium_live" } });
  expect(paddleConfigFromEnv({ ...env, PADDLE_ENVIRONMENT: "live" } as CloudflareEnv)).toMatchObject({ apiKey: "live-key", creditPrices: { 500: "pri_live" } });
});

it("adds a top-up's credits once when paid, and takes them back once if refunded", async () => {
  const u = await buyer(); const row = await bundle(u.id, "topup", 500, 30);
  await recordCreditTransaction(tx(row.id, 500, row.priceId, 1, { kind: "credits", status: "ready" }));
  expect(await balance(u.id)).toBe(15);
  const paid = tx(row.id, 500, row.priceId, 1, { kind: "credits" });
  await recordCreditTransaction(paid); await recordCreditTransaction(paid);
  expect(await balance(u.id)).toBe(45);
  await recordCreditTransaction({ ...paid, adjustments: [{ action: "refund", status: "approved" }] });
  await recordCreditTransaction({ ...paid, adjustments: [{ action: "refund", status: "approved" }] });
  expect(await balance(u.id)).toBe(15);
});

it("accepts a price with tax included, where Paddle's subtotal is below the price", async () => {
  const u = await buyer(); const row = await bundle(u.id, "topup", 500, 30);
  const paid = tx(row.id, 500, row.priceId, 8, { kind: "credits" });
  paid.details = { totals: { subtotal: "435", tax: "65", total: "500", discount: "0" } };
  await recordCreditTransaction(paid);
  expect(await balance(u.id)).toBe(45);
  const wrong = tx(row.id, 500, row.priceId, 9, { kind: "credits" });
  wrong.details = { totals: { subtotal: "300", tax: "45", total: "345", discount: "0" } };
  const other = await bundle(u.id, "topup", 500, 30);
  await expect(recordCreditTransaction({ ...wrong, custom_data: { ...wrong.custom_data, checkoutId: other.id } })).rejects.toMatchObject({ code: "VALIDATION" });
  expect(await balance(u.id)).toBe(45);
});

it("adds the credits as soon as Paddle says paid, and the page can check that one payment", async () => {
  const u = await buyer(); const row = await bundle(u.id, "topup", 500, 30);
  await prisma.creditCheckout.update({ where: { id: row.id }, data: { transactionId: txn(10) } });
  const paid = tx(row.id, 500, row.priceId, 10, { kind: "credits", status: "paid" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: paid })));
  expect(await refreshCreditPayments(u.id, txn(10))).toEqual({ added: true, credits: 30 });
  expect(await balance(u.id)).toBe(45);
  // Paddle's later "completed" changes nothing.
  await recordCreditTransaction({ ...paid, status: "completed" });
  expect(await balance(u.id)).toBe(45);
  const stranger = await buyer();
  await expect(refreshCreditPayments(stranger.id, txn(10))).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("unlocks Premium for the chosen trip with a bundle, never with the top-up", async () => {
  const u = await buyer(); const tripId = await makeTrip(u.id); const other = await makeTrip(u.id);
  const plus = await bundle(u.id, "plus", 2500, 200, tripId);
  await recordCreditTransaction(tx(plus.id, 2500, plus.priceId, 2, { kind: "credits", tripId }));
  expect((await getTripPlan(tripId)).premium).toBe(true);
  expect(await balance(u.id)).toBe(215);
  const top = await bundle(u.id, "topup", 500, 30, other);
  await recordCreditTransaction(tx(top.id, 500, top.priceId, 3, { kind: "credits", tripId: other }));
  expect((await getTripPlan(other)).premium).toBe(false);
});

it("refuses a payment that doesn't match the saved purchase", async () => {
  const u = await buyer(); const row = await bundle(u.id, "pro", 5000, 500);
  await expect(recordCreditTransaction(tx(row.id, 500, row.priceId, 4, { kind: "credits" }))).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(recordCreditTransaction(tx(row.id, 5000, price(9999), 4, { kind: "credits" }))).rejects.toMatchObject({ code: "VALIDATION" });
  expect(await balance(u.id)).toBe(15);
});

it("adds 100 credits to a $15 Premium trip purchase from the trip page", async () => {
  const u = await buyer(); const tripId = await makeTrip(u.id);
  const row = await prisma.premiumCheckout.create({ data: { tripId, buyerId: u.id, environment: "sandbox", priceId: price(1500), amountMinor: 1500, targetCapacity: 0 } });
  const paid = { ...tx(row.id, 1500, price(1500), 5, { tripId }), custom_data: { checkoutId: row.id, tripId, environment: "sandbox" as const } };
  await recordVerifiedTransaction(paid); await recordVerifiedTransaction(paid);
  expect(await balance(u.id)).toBe(115);
});

it("starts a checkout only for the buyer's own trip without Premium, with the bundle's Paddle price", async () => {
  const u = await buyer(); const stranger = await buyer(); const tripId = await makeTrip(u.id);
  await expect(beginCreditCheckout(stranger.id, "starter", tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(beginCreditCheckout(u.id, "topup", tripId)).rejects.toMatchObject({ code: "VALIDATION" });
  const sent: { url: string; body: { items: { price_id: string }[]; custom_data: Record<string, string> } }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)); sent.push({ url, body });
    const row = await prisma.creditCheckout.findUniqueOrThrow({ where: { id: body.custom_data.checkoutId } });
    return Response.json({ data: tx(row.id, row.amountMinor, row.priceId, 6, { kind: "credits", tripId, status: "ready" }) });
  }));
  const started = await beginCreditCheckout(u.id, "starter", tripId);
  expect(started).toMatchObject({ transactionId: txn(6), environment: "sandbox" });
  expect(sent[0].url).toBe("https://sandbox-api.paddle.com/transactions");
  expect(sent[0].body.items[0].price_id).toBe(price(1501));
  expect(sent[0].body.custom_data).toMatchObject({ kind: "credits", tripId, environment: "sandbox" });
});

it("confirms a credit purchase from Paddle's signed webhook", async () => {
  const u = await buyer(); const row = await bundle(u.id, "starter", 1500, 100);
  await prisma.creditCheckout.update({ where: { id: row.id }, data: { transactionId: txn(7), status: "PENDING" } });
  const data = tx(row.id, 1500, row.priceId, 7, { kind: "credits" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data })));
  const raw = JSON.stringify({ event_id: "evt_credits", event_type: "transaction.completed", data: { id: txn(7), custom_data: { checkoutId: row.id } } });
  const ts = Math.floor(Date.now() / 1000);
  await receivePaddleWebhook(raw, `ts=${ts};h1=${createHmac("sha256", config.webhookSecret).update(`${ts}:${raw}`).digest("hex")}`);
  expect(await balance(u.id)).toBe(115);
  expect((await prisma.billingDelivery.findFirstOrThrow()).status).toBe("PROCESSED");
});

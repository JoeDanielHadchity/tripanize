import { generateKeyPairSync, createVerify, randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime, type StoreConfig } from "@/server/cloudflare/runtime";
import { beginStorePurchase, completeStorePurchase, handleAppStoreNotification, signJwt, syncStoreRefunds } from "@/server/billing/store";
import { refreshTripPayment } from "@/server/billing/service";
import { getTripPlan } from "@/server/plans/access";
import { makeTrip, makeUser, resetDb } from "./helpers";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = (k: typeof rsa.privateKey) => k.export({ type: "pkcs8", format: "pem" }).toString();
const stores: StoreConfig = {
  productId: "tripanize_premium_trip", acceptSandbox: true,
  google: { packageName: "app.tripanize.mobile", clientEmail: "play@example.iam.gserviceaccount.com", privateKey: pem(rsa.privateKey), tokenUri: "https://oauth2.googleapis.com/token" },
  apple: { bundleId: "app.tripanize.mobile", keyId: "KEY123", issuerId: "issuer-1", privateKey: pem(ec.privateKey) },
};
const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true, stores }); });
afterEach(() => setTestRuntime(runtime));
const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
const jws = (payload: unknown) => `${b64({ alg: "ES256" })}.${b64(payload)}.sig`;

type Google = { purchaseState: number; obfuscatedExternalProfileId: string; orderId: string; purchaseType?: number };
function fakeStores(state: { google?: Google; apple?: Record<string, unknown>; voided?: string[] }) {
  const calls: string[] = [];
  const send: typeof fetch = async (input, init) => {
    const url = String(input); calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url === stores.google!.tokenUri) return Response.json({ access_token: "google-token", expires_in: 3600 });
    if (url.includes("androidpublisher")) {
      if (url.includes("voidedpurchases")) return Response.json({ voidedPurchases: (state.voided ?? []).map(orderId => ({ orderId })) });
      if (url.endsWith(":consume")) return new Response(null, { status: 204 });
      return state.google ? Response.json(state.google) : new Response("{}", { status: 404 });
    }
    if (url.includes("storekit.itunes.apple.com")) {
      if (!state.apple) return new Response("{}", { status: 404 });
      return Response.json({ signedTransactionInfo: jws(state.apple) });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  return { send, calls };
}

async function fixture() {
  const owner = await makeUser("Ana"), friend = await makeUser("Ben");
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: friend.id, role: "COLLABORATOR" } });
  return { owner, friend, tripId };
}

it("signs RS256 and ES256 JWTs that verify with the public keys", async () => {
  for (const [alg, keys] of [["RS256", rsa], ["ES256", ec]] as const) {
    const token = await signJwt({ alg, typ: "JWT" }, { iss: "x" }, pem(keys.privateKey));
    const [h, p, s] = token.split(".");
    const verify = createVerify("SHA256"); verify.update(`${h}.${p}`);
    expect(verify.verify({ key: keys.publicKey, ...(alg === "ES256" ? { dsaEncoding: "ieee-p1363" as const } : {}) }, Buffer.from(s, "base64url"))).toBe(true);
  }
});

it("only the organizer starts a purchase, and retries reuse the open intent", async () => {
  const { owner, friend, tripId } = await fixture();
  await expect(beginStorePurchase(friend.id, tripId, "google_play")).rejects.toMatchObject({ code: "FORBIDDEN" });
  const first = await beginStorePurchase(owner.id, tripId, "google_play");
  expect(first.intentId).toMatch(/^[0-9a-f-]{36}$/);
  expect(first.accountId).not.toContain(owner.id);
  expect((await beginStorePurchase(owner.id, tripId, "google_play")).intentId).toBe(first.intentId);
  setTestRuntime({ ...runtime, planAccessEnabled: true, stores: { ...stores, apple: undefined } });
  await expect(beginStorePurchase(owner.id, tripId, "app_store")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
});

it("verifies a Google Play purchase server-side, grants Premium once and consumes it", async () => {
  const { owner, tripId } = await fixture();
  const { intentId, productId } = await beginStorePurchase(owner.id, tripId, "google_play");
  const purchaseToken = "token-".padEnd(40, "a");
  const wrong = fakeStores({ google: { purchaseState: 0, obfuscatedExternalProfileId: randomUUID(), orderId: "GPA.1" } });
  await expect(completeStorePurchase(owner.id, { store: "google_play", intentId, productId, purchaseToken }, wrong.send)).rejects.toMatchObject({ code: "VALIDATION" });
  const pending = fakeStores({ google: { purchaseState: 2, obfuscatedExternalProfileId: intentId, orderId: "GPA.1" } });
  expect((await completeStorePurchase(owner.id, { store: "google_play", intentId, productId, purchaseToken }, pending.send)).status).toBe("pending");
  expect((await getTripPlan(tripId)).premium).toBe(false);
  const paid = fakeStores({ google: { purchaseState: 0, obfuscatedExternalProfileId: intentId, orderId: "GPA.1234" } });
  expect(await completeStorePurchase(owner.id, { store: "google_play", intentId, productId, purchaseToken }, paid.send)).toEqual({ status: "completed", tripId });
  expect(await completeStorePurchase(owner.id, { store: "google_play", intentId, productId, purchaseToken }, paid.send)).toEqual({ status: "completed", tripId });
  expect(paid.calls.filter(c => c.endsWith(":consume"))).toHaveLength(2);
  expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "purchase" });
  expect(await prisma.premiumCheckout.findFirstOrThrow({ where: { id: intentId } })).toMatchObject({ status: "COMPLETED", transactionId: "gp:GPA.1234", amountMinor: 1500 });
  // Paddle refresh never sends store transactions to Paddle.
  await expect(refreshTripPayment(owner.id, tripId)).resolves.toBeTruthy();
  // A refund in the voided purchases list removes Premium on the next hourly sync.
  expect(await syncStoreRefunds(fakeStores({ voided: ["GPA.1234"] }).send)).toBe(1);
  expect((await getTripPlan(tripId)).premium).toBe(false);
});

it("a purchase cannot be replayed onto another trip", async () => {
  const { owner, tripId } = await fixture();
  const other = await makeTrip(owner.id, { name: "Second trip" });
  const a = await beginStorePurchase(owner.id, tripId, "google_play");
  const b = await beginStorePurchase(owner.id, other, "google_play");
  const purchaseToken = "token-".padEnd(40, "b");
  const paid = fakeStores({ google: { purchaseState: 0, obfuscatedExternalProfileId: a.intentId, orderId: "GPA.9" } });
  await completeStorePurchase(owner.id, { store: "google_play", intentId: a.intentId, productId: a.productId, purchaseToken }, paid.send);
  await expect(completeStorePurchase(owner.id, { store: "google_play", intentId: b.intentId, productId: b.productId, purchaseToken }, paid.send)).rejects.toMatchObject({ code: "VALIDATION" });
  expect((await getTripPlan(other)).premium).toBe(false);
});

it("verifies App Store transactions by appAccountToken and handles refund notifications", async () => {
  const { owner, friend, tripId } = await fixture();
  const { intentId, productId } = await beginStorePurchase(owner.id, tripId, "app_store");
  const transaction = { bundleId: "app.tripanize.mobile", productId, transactionId: "2000000123", appAccountToken: intentId, type: "Consumable", environment: "Production", purchaseDate: Date.now(), price: 14990, currency: "USD" };
  await expect(completeStorePurchase(friend.id, { store: "app_store", intentId, productId, transactionId: "2000000123" }, fakeStores({ apple: transaction }).send)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(completeStorePurchase(owner.id, { store: "app_store", intentId, productId, transactionId: "2000000123" }, fakeStores({ apple: { ...transaction, bundleId: "com.other" } }).send)).rejects.toMatchObject({ code: "VALIDATION" });
  await completeStorePurchase(owner.id, { store: "app_store", intentId, productId, transactionId: "2000000123" }, fakeStores({ apple: transaction }).send);
  expect((await getTripPlan(tripId)).premium).toBe(true);
  // A forged "refund" for a transaction Apple still shows as valid changes nothing.
  const notification = { signedPayload: jws({ notificationType: "REFUND", data: { bundleId: "app.tripanize.mobile", signedTransactionInfo: jws({ transactionId: "2000000123" }) } }) };
  await handleAppStoreNotification(notification, fakeStores({ apple: transaction }).send);
  expect((await getTripPlan(tripId)).premium).toBe(true);
  await handleAppStoreNotification(notification, fakeStores({ apple: { ...transaction, revocationDate: Date.now() } }).send);
  expect((await getTripPlan(tripId)).premium).toBe(false);
});

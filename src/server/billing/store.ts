import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { getTripPlan } from "@/server/plans/access";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { currentRuntime, type StoreConfig } from "@/server/cloudflare/runtime";
import { pendingTrialInvitations } from "@/server/admin/trials";
import { billingEnvironment } from "./config";

/** Google Play and the App Store sell one consumable product: Premium for one
 * trip. A purchase is a PremiumCheckout row like a Paddle one, so plan access,
 * admin totals and onboarding all keep working unchanged. Nothing the phone
 * says is trusted: every purchase is re-read from the store's server API. */
export type Store = "google_play" | "app_store";
export const STORE_STATUS = "STORE_PENDING";
const PRICE_MINOR = 1500;
type Fetch = typeof fetch;

export function storeConfig(): StoreConfig | undefined { return currentRuntime().stores; }
export function storeAvailable(store: Store) {
  const c = storeConfig();
  return Boolean(c && (store === "google_play" ? c.google : c.apple));
}
export const isStoreTransaction = (transactionId: string | null | undefined) => Boolean(transactionId && /^(gp|as):/.test(transactionId));
const priceId = (store: Store, productId: string) => `${store}:${productId}`;
/** Opaque per-user id for Google's fraud checks; never the raw account id. */
export const storeAccountId = (userId: string) => createHash("sha256").update(`tripanize-store:${userId}`).digest("hex").slice(0, 64);

// ───────────────────────── Purchase flow ─────────────────────────

export async function beginStorePurchase(userId: string, tripId: string, store: Store) {
  await requireTrip(tripId, userId, "manage");
  const config = storeConfig();
  if (!config || !storeAvailable(store)) throw new AppError("NOT_CONFIGURED", "In-app purchases are being set up. Your trip is still available.");
  if ((await pendingTrialInvitations(userId)).length && !(await getTripPlan(tripId)).premium) throw new AppError("CONFLICT", "You have a Premium trial invitation. Activate your free trial for this trip from the Premium page; no payment is needed.");
  await rateLimit(`store-intent:${tripId}:${userId}`, 20, 3600);
  const environment = billingEnvironment(), id = priceId(store, config.productId);
  const intent = await prisma.$transaction(async db => {
    const member = await db.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId } } });
    if (member?.role !== "OWNER") throw new AppError("FORBIDDEN", "Only the trip organizer can purchase Premium.");
    const plan = await getTripPlan(tripId, db);
    if (plan.premium) throw new AppError("CONFLICT", "Premium is already active for this trip. Please refresh.");
    if (plan.reviewRequired) throw new AppError("CONFLICT", "A payment adjustment needs review before another purchase. Please contact support.");
    // One open intent per trip and store. Reusing it keeps retries idempotent.
    const open = await db.premiumCheckout.findFirst({ where: { tripId, buyerId: userId, environment, priceId: id, status: STORE_STATUS, transactionId: null }, orderBy: { createdAt: "desc" } });
    if (open) return open;
    // App Store appAccountToken must be a UUID, so store intents use one as their id.
    return db.premiumCheckout.create({ data: { id: crypto.randomUUID(), tripId, buyerId: userId, environment, priceId: id, amountMinor: PRICE_MINOR, targetCapacity: 0, status: STORE_STATUS } });
  });
  return { intentId: intent.id, productId: config.productId, accountId: storeAccountId(userId) };
}

export const completeInput = z.discriminatedUnion("store", [
  z.object({ store: z.literal("google_play"), intentId: z.uuid(), productId: z.string().min(1).max(150), purchaseToken: z.string().min(10).max(2000) }),
  z.object({ store: z.literal("app_store"), intentId: z.uuid(), productId: z.string().min(1).max(150), transactionId: z.string().regex(/^\d{1,30}$/) }),
]);
export type CompleteStorePurchase = z.infer<typeof completeInput>;

/** Verifies a purchase with the store and grants Premium in one transaction.
 * Safe to call again for the same purchase: it returns the saved result. */
export async function completeStorePurchase(userId: string, input: CompleteStorePurchase, send: Fetch = fetch) {
  const config = storeConfig();
  if (!config || !storeAvailable(input.store)) throw new AppError("NOT_CONFIGURED", "In-app purchases are being set up.");
  await rateLimit(`store-verify:${userId}`, 60, 3600);
  const intent = await prisma.premiumCheckout.findUnique({ where: { id: input.intentId } });
  if (!intent || intent.buyerId !== userId || intent.environment !== billingEnvironment() || intent.priceId !== priceId(input.store, config.productId) || input.productId !== config.productId) throw new AppError("NOT_FOUND", "This purchase does not match a Tripanize checkout.");
  const verified = input.store === "google_play" ? await verifyGoogle(config, input.purchaseToken, intent.id, send) : await verifyApple(config, input.transactionId, intent.id, send);
  if (verified.state === "pending") return { status: "pending" as const, tripId: intent.tripId };
  if (verified.state !== "purchased") throw new AppError("VALIDATION", verified.state === "refunded" ? "This purchase was refunded." : "The store did not confirm this purchase.");
  if (verified.sandbox && !config.acceptSandbox) throw new AppError("VALIDATION", "Test purchases are not accepted.");
  await prisma.$transaction(async db => {
    const other = await db.premiumCheckout.findUnique({ where: { transactionId: verified.transactionId } });
    if (other && other.id !== intent.id) throw new AppError("CONFLICT", "This purchase was already used for another trip.");
    const current = await db.premiumCheckout.findUniqueOrThrow({ where: { id: intent.id } });
    if (current.status === "COMPLETED") return;
    if (current.status !== STORE_STATUS) throw new AppError("CONFLICT", "This purchase can no longer be applied. Please contact support.");
    await db.premiumCheckout.update({ where: { id: intent.id }, data: { status: "COMPLETED", transactionId: verified.transactionId, reviewRequired: false, paddleSummary: summary(input.store, verified) } });
    await db.trip.updateMany({ where: { id: intent.tripId, onboardingStage: "PLAN" }, data: { onboardingStage: "DETAILS", onboardingPlan: "PREMIUM" } });
  });
  // Google refunds purchases that are not acknowledged within three days. The
  // app also finishes the purchase; consuming twice is harmless.
  if (input.store === "google_play") await consumeGoogle(config, input.purchaseToken, send).catch(() => undefined);
  return { status: "completed" as const, tripId: intent.tripId };
}

const summary = (store: Store, v: Verified) => JSON.parse(JSON.stringify({ store, productId: v.productId, orderId: v.transactionId, sandbox: v.sandbox, purchasedAt: v.purchasedAt, price: v.price, verifiedAt: new Date().toISOString() })) as Prisma.InputJsonValue;

/** Admin "refresh payment" for a store purchase: re-read it from the store. */
export async function resyncStorePurchase(checkoutId: string, send: Fetch = fetch) {
  const config = storeConfig();
  const row = await prisma.premiumCheckout.findUnique({ where: { id: checkoutId } });
  if (!config || !row?.transactionId || !isStoreTransaction(row.transactionId)) throw new AppError("NOT_FOUND", "This purchase has no store transaction to refresh.");
  if (row.transactionId.startsWith("as:") && config.apple) {
    const v = await verifyApple(config, row.transactionId.slice(3), row.id, send);
    if (v.state === "refunded") await markRefunded(row.transactionId);
  }
  // Google refunds are read from the voided purchases list, see syncStoreRefunds.
  if (row.transactionId.startsWith("gp:") && config.google) await syncGoogleVoided(config, send);
}

async function markRefunded(transactionId: string) {
  const row = await prisma.premiumCheckout.findUnique({ where: { transactionId } });
  if (!row || row.status === "REFUNDED") return false;
  await prisma.premiumCheckout.update({ where: { id: row.id }, data: { status: "REFUNDED", paddleSummary: { ...(row.paddleSummary as Record<string, unknown> | null ?? {}), refundedAt: new Date().toISOString() } as Prisma.InputJsonValue } });
  return true;
}

// ───────────────────────── Google Play ─────────────────────────

type Verified = { state: "purchased" | "pending" | "cancelled" | "refunded"; transactionId: string; productId: string; sandbox: boolean; purchasedAt?: string; price?: string };
const googleTokens = new Map<string, { token: string; expires: number }>();

async function googleAccessToken(c: NonNullable<StoreConfig["google"]>, send: Fetch) {
  const cached = googleTokens.get(c.clientEmail);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({ alg: "RS256", typ: "JWT" }, { iss: c.clientEmail, scope: "https://www.googleapis.com/auth/androidpublisher", aud: c.tokenUri, iat: now, exp: now + 3600 }, c.privateKey);
  const response = await send(c.tokenUri, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !body?.access_token) throw new AppError("UPSTREAM", "Could not reach Google Play. Your purchase is safe; please try again.");
  googleTokens.set(c.clientEmail, { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

async function googleApi(c: NonNullable<StoreConfig["google"]>, path: string, send: Fetch, init: RequestInit = {}) {
  const token = await googleAccessToken(c, send);
  return send(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(c.packageName)}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(15_000) });
}

const googlePurchase = z.object({
  purchaseState: z.number().int().optional(), consumptionState: z.number().int().optional(), orderId: z.string().optional(),
  purchaseTimeMillis: z.string().optional(), purchaseType: z.number().int().optional(), obfuscatedExternalProfileId: z.string().optional(),
  productId: z.string().optional(), regionCode: z.string().optional(),
});

async function verifyGoogle(c: StoreConfig, purchaseToken: string, intentId: string, send: Fetch): Promise<Verified> {
  const g = c.google!;
  const response = await googleApi(g, `/purchases/products/${encodeURIComponent(c.productId)}/tokens/${encodeURIComponent(purchaseToken)}`, send);
  if (response.status === 404 || response.status === 400 || response.status === 410) throw new AppError("VALIDATION", "Google Play did not recognize this purchase.");
  if (!response.ok) throw new AppError("UPSTREAM", "Could not reach Google Play. Your purchase is safe; please try again.");
  const p = googlePurchase.parse(await response.json());
  // The intent id travels in the purchase itself, so a token for another trip or app cannot be replayed.
  if (p.obfuscatedExternalProfileId !== intentId) throw new AppError("VALIDATION", "This purchase belongs to another checkout.");
  const transactionId = `gp:${p.orderId || createHash("sha256").update(purchaseToken).digest("hex").slice(0, 40)}`;
  const state = p.purchaseState === 0 ? "purchased" : p.purchaseState === 2 ? "pending" : "cancelled";
  return { state, transactionId, productId: c.productId, sandbox: p.purchaseType === 0, purchasedAt: p.purchaseTimeMillis ? new Date(Number(p.purchaseTimeMillis)).toISOString() : undefined };
}

async function consumeGoogle(c: StoreConfig, purchaseToken: string, send: Fetch) {
  await googleApi(c.google!, `/purchases/products/${encodeURIComponent(c.productId)}/tokens/${encodeURIComponent(purchaseToken)}:consume`, send, { method: "POST" });
}

const voided = z.object({ voidedPurchases: z.array(z.object({ orderId: z.string().optional(), purchaseToken: z.string().optional() })).optional(), tokenPagination: z.object({ nextPageToken: z.string().optional() }).optional() });
async function syncGoogleVoided(c: StoreConfig, send: Fetch) {
  let page: string | undefined, refunded = 0;
  const start = Date.now() - 30 * 86_400_000;
  for (let i = 0; i < 10; i++) {
    const q = new URLSearchParams({ startTime: String(start), maxResults: "1000", type: "0", ...(page ? { token: page } : {}) });
    const response = await googleApi(c.google!, `/purchases/voidedpurchases?${q}`, send);
    if (!response.ok) throw new Error(`Google voided purchases returned ${response.status}.`);
    const body = voided.parse(await response.json());
    for (const v of body.voidedPurchases ?? []) if (v.orderId && await markRefunded(`gp:${v.orderId}`)) refunded++;
    page = body.tokenPagination?.nextPageToken;
    if (!page) break;
  }
  return refunded;
}

// ───────────────────────── App Store ─────────────────────────

async function appleApi(c: NonNullable<StoreConfig["apple"]>, path: string, send: Fetch) {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({ alg: "ES256", kid: c.keyId, typ: "JWT" }, { iss: c.issuerId, iat: now, exp: now + 1200, aud: "appstoreconnect-v1", bid: c.bundleId }, c.privateKey);
  const headers = { Authorization: `Bearer ${jwt}`, Accept: "application/json" };
  // App Review and TestFlight purchases live in the sandbox; try production first.
  for (const host of ["https://api.storekit.itunes.apple.com", "https://api.storekit-sandbox.itunes.apple.com"]) {
    const response = await send(`${host}${path}`, { headers, signal: AbortSignal.timeout(15_000) });
    if (response.status === 404 && host.includes("itunes.apple.com") && !host.includes("sandbox")) continue;
    return response;
  }
  throw new AppError("VALIDATION", "The App Store did not recognize this purchase.");
}

const appleTransaction = z.object({
  bundleId: z.string(), productId: z.string(), transactionId: z.string(), appAccountToken: z.string().optional(), type: z.string().optional(),
  environment: z.string().optional(), purchaseDate: z.number().optional(), revocationDate: z.number().optional(), price: z.number().optional(), currency: z.string().optional(),
});

/** Only call with a JWS received directly from Apple's API over TLS. */
function jwsPayload(jws: string): unknown {
  const part = jws.split(".")[1];
  if (!part) throw new AppError("UPSTREAM", "Unexpected App Store response.");
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
}

async function appleTransactionInfo(c: StoreConfig, transactionId: string, send: Fetch) {
  const response = await appleApi(c.apple!, `/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, send);
  if (response.status === 404 || response.status === 400) throw new AppError("VALIDATION", "The App Store did not recognize this purchase.");
  if (!response.ok) throw new AppError("UPSTREAM", "Could not reach the App Store. Your purchase is safe; please try again.");
  const body = await response.json() as { signedTransactionInfo?: string };
  if (!body.signedTransactionInfo) throw new AppError("UPSTREAM", "Unexpected App Store response.");
  return appleTransaction.parse(jwsPayload(body.signedTransactionInfo));
}

async function verifyApple(c: StoreConfig, transactionId: string, intentId: string, send: Fetch): Promise<Verified> {
  const t = await appleTransactionInfo(c, transactionId, send);
  if (t.bundleId !== c.apple!.bundleId || t.productId !== c.productId) throw new AppError("VALIDATION", "This purchase is for another product.");
  if (t.appAccountToken?.toLowerCase() !== intentId.toLowerCase()) throw new AppError("VALIDATION", "This purchase belongs to another checkout.");
  return { state: t.revocationDate ? "refunded" : "purchased", transactionId: `as:${t.transactionId}`, productId: t.productId, sandbox: t.environment === "Sandbox", purchasedAt: t.purchaseDate ? new Date(t.purchaseDate).toISOString() : undefined, price: t.price !== undefined && t.currency ? `${t.price / 1000} ${t.currency}` : undefined };
}

/** App Store Server Notifications V2. The posted payload is used only to learn
 * which transaction changed; its status is re-read from Apple's API. */
export async function handleAppStoreNotification(body: unknown, send: Fetch = fetch) {
  const c = storeConfig();
  if (!c?.apple) return { ok: true };
  const signed = z.object({ signedPayload: z.string().max(100_000) }).safeParse(body);
  if (!signed.success) throw new AppError("VALIDATION", "Invalid notification.");
  await rateLimit("app-store-notifications", 600, 3600);
  let transactionId: string | undefined;
  try {
    const payload = jwsPayload(signed.data.signedPayload) as { notificationType?: string; data?: { signedTransactionInfo?: string; bundleId?: string } };
    if (payload.data?.bundleId && payload.data.bundleId !== c.apple.bundleId) return { ok: true };
    if (!["REFUND", "REVOKE", "REFUND_REVERSED"].includes(payload.notificationType ?? "")) return { ok: true };
    const info = payload.data?.signedTransactionInfo ? jwsPayload(payload.data.signedTransactionInfo) as { transactionId?: string } : null;
    transactionId = info?.transactionId;
  } catch { throw new AppError("VALIDATION", "Invalid notification."); }
  if (!transactionId || !/^\d{1,30}$/.test(transactionId)) return { ok: true };
  const row = await prisma.premiumCheckout.findUnique({ where: { transactionId: `as:${transactionId}` } });
  if (!row) return { ok: true };
  const t = await appleTransactionInfo(c, transactionId, send);
  if (t.revocationDate) await markRefunded(row.transactionId!);
  else if (row.status === "REFUNDED") await prisma.premiumCheckout.update({ where: { id: row.id }, data: { status: "COMPLETED" } });
  return { ok: true };
}

/** Hourly: Google has no push for refunds without Pub/Sub, so poll voided purchases. */
export async function syncStoreRefunds(send: Fetch = fetch) {
  const c = storeConfig();
  if (!c?.google) return 0;
  const anySold = await prisma.premiumCheckout.count({ where: { transactionId: { startsWith: "gp:" }, status: "COMPLETED" } });
  return anySold ? syncGoogleVoided(c, send) : 0;
}

// ───────────────────────── JWT signing (WebCrypto) ─────────────────────────

function base64Url(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = ""; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecode(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}
function pemBody(pem: string) {
  return base64UrlDecode(pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\s+/g, "").replace(/\+/g, "-").replace(/\//g, "_"));
}
export async function signJwt(header: { alg: "RS256" | "ES256"; [k: string]: string }, claims: Record<string, unknown>, privateKeyPem: string) {
  const algorithm = header.alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } : { name: "ECDSA", namedCurve: "P-256" };
  const key = await crypto.subtle.importKey("pkcs8", pemBody(privateKeyPem), algorithm, false, ["sign"]);
  const input = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  // WebCrypto ECDSA signatures are already the raw r||s form JWS expects.
  const signature = await crypto.subtle.sign(header.alg === "RS256" ? "RSASSA-PKCS1-v1_5" : { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

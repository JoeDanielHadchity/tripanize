import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { rateLimit } from "@/server/ratelimit";
import { getTripPlan } from "@/server/plans/access";
import { CREDIT_BUNDLES, type CreditBundle } from "@/lib/credits";
import { billingEnvironment, creditCheckoutAvailable } from "./config";
import { fetchTransaction, paddleRequest, paddleTransaction, type PaddleTransaction } from "./paddle";

type Db = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
const REFUND_ACTIONS = ["refund", "credit", "chargeback", "chargeback_warning"];

/**
 * Adds a purchase's credits once, and takes them back once if the payment is later refunded or
 * charged back. Shared by credit bundles and the trip page's $15 Premium (which includes 100 credits).
 */
export async function settlePurchaseCredits(db: Db, input: { userId: string; credits: number; transactionId: string; status: string; reviewRequired: boolean; note: string; tripId?: string | null }) {
  const key = `purchase:${input.transactionId}`;
  const granted = await db.creditEntry.findUnique({ where: { dedupeKey: key }, select: { id: true } });
  if (input.status === "COMPLETED" && !input.reviewRequired && !granted) {
    await db.creditEntry.create({ data: { userId: input.userId, amount: input.credits, kind: "purchase", note: input.note, tripId: input.tripId ?? null, dedupeKey: key } });
  }
  if (granted && input.reviewRequired && !await db.creditEntry.findUnique({ where: { dedupeKey: `refund:${input.transactionId}` }, select: { id: true } })) {
    await db.creditEntry.create({ data: { userId: input.userId, amount: -input.credits, kind: "adjust", note: "Payment refunded", tripId: input.tripId ?? null, dedupeKey: `refund:${input.transactionId}` } });
  }
}

/** Checks a Paddle transaction against the saved credit purchase, records it, and adds the credits once paid. */
export async function recordCreditTransaction(tx: PaddleTransaction) {
  return prisma.$transaction(async db => {
    const intent = await db.creditCheckout.findUnique({ where: { id: tx.custom_data.checkoutId } });
    if (!intent) return null;
    const item = tx.items[0];
    if (intent.environment !== billingEnvironment() || tx.custom_data.environment !== intent.environment || tx.custom_data.kind !== "credits" || (tx.custom_data.tripId || null) !== intent.tripId || (intent.transactionId && intent.transactionId !== tx.id) || tx.currency_code !== "USD" || tx.subscription_id !== null || tx.discount_id !== null || tx.items.length !== 1 || item.quantity !== 1 || item.price.id !== intent.priceId || item.price.billing_cycle !== null || item.price.unit_price.currency_code !== "USD" || item.price.unit_price.amount !== String(intent.amountMinor)) {
      throw new AppError("VALIDATION", "Payment does not match the saved credit purchase.");
    }
    // The price can be set with tax added on top (subtotal = price) or tax included (total = price).
    const totals = tx.details?.totals, amount = String(intent.amountMinor);
    // "paid" means the payment is captured; Paddle marks it "completed" a few seconds later. Credits land on either.
    const paid = tx.status === "paid" || tx.status === "completed";
    if (paid && (!totals || totals.discount !== "0" || (totals.subtotal !== amount && totals.total !== amount))) throw new AppError("VALIDATION", "Payment total could not be verified.");
    const reviewRequired = (tx.adjustments ?? []).some(a => a.status === "approved" && REFUND_ACTIONS.includes(a.action));
    const status = paid ? "COMPLETED" : tx.status === "canceled" ? "CANCELED" : "PENDING";
    await db.creditCheckout.update({ where: { id: intent.id }, data: { transactionId: tx.id, status, reviewRequired, ...(tx.details ? { paddleSummary: JSON.parse(JSON.stringify({ currency: tx.currency_code, totals: tx.details.totals, adjusted: tx.details.adjusted_totals, payout: tx.details.payout_totals, adjustments: tx.adjustments, syncedAt: new Date().toISOString() })) as Prisma.InputJsonValue } : {}) } });
    const bundle = CREDIT_BUNDLES.find(b => b.id === intent.bundle);
    await settlePurchaseCredits(db, { userId: intent.buyerId, credits: intent.credits, transactionId: tx.id, status, reviewRequired, note: `${bundle?.name ?? "Credits"}: ${intent.credits} credits`, tripId: intent.tripId });
    // A bundle that unlocks Premium moves a trip still choosing its plan straight on to its details.
    if (status === "COMPLETED" && !reviewRequired && intent.tripId) await db.trip.updateMany({ where: { id: intent.tripId, onboardingStage: "PLAN" }, data: { onboardingStage: "DETAILS", onboardingPlan: "PREMIUM" } });
    return intent.id;
  });
}

export async function reconcileCreditPayment(transactionId: string) {
  return recordCreditTransaction(await fetchTransaction(transactionId));
}

/** Trips this person organizes that a bundle could unlock (no Premium yet). */
export async function unlockableTrips(userId: string) {
  const trips = await prisma.trip.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const out: { id: string; name: string }[] = [];
  for (const t of trips) if (!(await getTripPlan(t.id)).premium) out.push(t);
  return out;
}

/**
 * Starts a Paddle checkout for a credit bundle. For bundles that unlock Premium, `tripId` names a trip
 * the buyer organizes that has no Premium yet (or null for credits only).
 */
export async function beginCreditCheckout(userId: string, bundleId: CreditBundle["id"], tripId: string | null) {
  if (!creditCheckoutAvailable()) throw new AppError("NOT_CONFIGURED", "Top up is being set up. Please try again soon.");
  const bundle = CREDIT_BUNDLES.find(b => b.id === bundleId);
  if (!bundle) throw new AppError("VALIDATION", "Choose a credit bundle.");
  if (tripId && !bundle.unlocksPremium) throw new AppError("VALIDATION", "The top-up adds credits only. Choose a bundle to unlock Premium for a trip.");
  if (tripId) {
    const trip = await prisma.trip.findFirst({ where: { id: tripId, ownerId: userId }, select: { id: true } });
    if (!trip) throw new AppError("NOT_FOUND", "Choose a trip you organize.");
    if ((await getTripPlan(tripId)).premium) throw new AppError("CONFLICT", "This trip already has Premium. Choose another trip, or buy credits only.");
  }
  await rateLimit(`credit-checkout:${userId}`, 12, 3600);
  const environment = billingEnvironment();
  const c = currentRuntime().paddle!;
  const priceId = c.creditPrices?.[bundle.priceCents];
  if (!priceId) throw new AppError("NOT_CONFIGURED", "This bundle isn't available yet.");
  // An unpaid checkout for the same bundle and trip is reused instead of creating a second charge.
  const open = await prisma.creditCheckout.findFirst({ where: { buyerId: userId, environment, bundle: bundle.id, tripId, status: "PENDING", transactionId: { not: null }, createdAt: { gt: new Date(Date.now() - 6 * 3600_000) } }, orderBy: { createdAt: "desc" } });
  if (open?.transactionId) {
    await reconcileCreditPayment(open.transactionId);
    const fresh = await prisma.creditCheckout.findUniqueOrThrow({ where: { id: open.id } });
    if (fresh.status === "PENDING") return { transactionId: open.transactionId, clientToken: c.clientToken, environment, reused: true };
  }
  const intent = await prisma.creditCheckout.create({ data: { buyerId: userId, bundle: bundle.id, credits: bundle.credits, tripId, environment, priceId, amountMinor: bundle.priceCents } });
  // No automatic retry: an interrupted request must never create a second chargeable transaction.
  const response = paddleTransaction.safeParse(await paddleRequest("/transactions", { items: [{ price_id: priceId, quantity: 1 }], currency_code: "USD", collection_mode: "automatic", custom_data: { checkoutId: intent.id, tripId: tripId ?? "", environment, kind: "credits" } }));
  if (!response.success) throw new AppError("UPSTREAM", "Checkout is awaiting confirmation. Please try again later.");
  await recordCreditTransaction(response.data);
  return { transactionId: response.data.id, clientToken: c.clientToken, environment, reused: false };
}

/**
 * Re-reads this person's recent credit payments from Paddle. With a transaction id (right after checkout),
 * checks that payment first and says whether its credits have been added.
 */
export async function refreshCreditPayments(userId: string, transactionId?: string) {
  await rateLimit(`credit-payment-status:${userId}`, 120, 300);
  if (transactionId) {
    const row = await prisma.creditCheckout.findFirst({ where: { buyerId: userId, transactionId, environment: billingEnvironment() } });
    if (!row) throw new AppError("NOT_FOUND", "Payment not found.");
    if (row.status !== "COMPLETED") await reconcileCreditPayment(transactionId);
    const fresh = await prisma.creditCheckout.findUniqueOrThrow({ where: { id: row.id } });
    return { added: fresh.status === "COMPLETED" && !fresh.reviewRequired, credits: fresh.credits };
  }
  const recent = await prisma.creditCheckout.findMany({ where: { buyerId: userId, environment: billingEnvironment(), status: { in: ["PENDING", "COMPLETED"] }, transactionId: { not: null }, createdAt: { gt: new Date(Date.now() - 2 * 86400_000) } }, orderBy: { createdAt: "desc" }, take: 3 });
  for (const r of recent) await reconcileCreditPayment(r.transactionId!);
  return { added: false, credits: 0 };
}

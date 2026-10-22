import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { getTripPlan } from "@/server/plans/access";
import { AppError } from "@/server/errors";
import { PREMIUM_BANDS, premiumBandForPeople, type PremiumBandId } from "@/lib/plans";
import { billingEnvironment, checkoutAvailable } from "./config";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { rateLimit } from "@/server/ratelimit";
import { fetchTransaction, paddleRequest, paddleTransaction, type PaddleTransaction } from "./paddle";

export async function billingSummary(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId);
  const plan = await getTripPlan(tripId);
  const recommended = premiumBandForPeople(plan.people);
  return { ...plan, canPurchase: access.role === "OWNER", available: checkoutAvailable(), environment: billingEnvironment(), recommended: recommended?.id ?? null,
    options: PREMIUM_BANDS.map(b => ({ ...b, eligible: b.capacity >= plan.people && b.priceMinor > plan.creditMinor, dueMinor: Math.max(0, b.priceMinor - plan.creditMinor) })) };
}

/** Re-read Paddle's current transaction, rather than trusting delivery order or browser callbacks. */
export async function reconcilePayment(transactionId: string) {
  const tx = await fetchTransaction(transactionId);
  return recordVerifiedTransaction(tx);
}
export async function recordVerifiedTransaction(tx: PaddleTransaction) {
  return prisma.$transaction(async db => {
    const intent = await db.premiumCheckout.findUnique({ where: { id: tx.custom_data.checkoutId } });
    if (!intent) return; // Other products in the same merchant account are not ours.
    const item = tx.items[0];
    if (intent.environment !== billingEnvironment() || tx.custom_data.environment !== intent.environment || tx.custom_data.tripId !== intent.tripId || (intent.transactionId && intent.transactionId !== tx.id) || tx.currency_code !== "USD" || tx.subscription_id !== null || tx.discount_id !== null || tx.items.length !== 1 || item.quantity !== 1 || item.price.id !== intent.priceId || item.price.billing_cycle !== null || item.price.unit_price.currency_code !== "USD" || item.price.unit_price.amount !== String(intent.amountMinor)) {
      throw new AppError("VALIDATION", "Payment does not match the saved trip purchase.");
    }
    if (tx.status === "completed" && (!tx.details || tx.details.totals.subtotal !== String(intent.amountMinor) || tx.details.totals.discount !== "0" || !tx.adjustments)) throw new AppError("VALIDATION", "Payment total could not be verified.");
    // Refunds/chargebacks remove this payment's credit. Reversed adjustments do
    // not revoke it; unusual partial adjustments require merchant review before rebuying.
    const reviewRequired = (tx.adjustments ?? []).some(a => a.status === "approved" && ["refund", "credit", "chargeback", "chargeback_warning"].includes(a.action));
    const status = tx.status === "completed" ? "COMPLETED" : tx.status === "canceled" ? "CANCELED" : "PENDING";
    await db.premiumCheckout.update({ where: { id: intent.id }, data: { transactionId: tx.id, status, reviewRequired } });
    return intent.tripId;
  });
}

export async function beginCheckout(userId: string, tripId: string, bandId: PremiumBandId) {
  await requireTrip(tripId, userId, "manage");
  if (!checkoutAvailable()) throw new AppError("NOT_CONFIGURED", "Premium checkout is being set up. Your trip is still available.");
  await rateLimit(`checkout:${tripId}:${userId}`, 12, 3600);
  const environment = billingEnvironment();
  const c = currentRuntime().paddle!;
  const existing = await prisma.premiumCheckout.findFirst({ where: { tripId, environment, status: { in: ["CREATING", "PENDING"] } }, orderBy: { createdAt: "desc" } });
  if (existing) {
    if (!existing.transactionId) throw new AppError("CONFLICT", "A checkout is awaiting confirmation. Please contact the organizer before trying another payment.");
    await reconcilePayment(existing.transactionId);
    const refreshed = await prisma.premiumCheckout.findUniqueOrThrow({ where: { id: existing.id } });
    if (refreshed.status === "PENDING") return { transactionId: existing.transactionId, clientToken: c.clientToken, environment, reused: true, amountMinor: existing.amountMinor, capacity: existing.targetCapacity };
  }
  const intent = await prisma.$transaction(async db => {
    const member = await db.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId } } });
    if (member?.role !== "OWNER") throw new AppError("FORBIDDEN", "Only the trip owner can purchase Premium.");
    const active = await db.premiumCheckout.findFirst({ where: { tripId, environment, status: { in: ["CREATING", "PENDING"] } } });
    if (active) throw new AppError("CONFLICT", "Another checkout is already being prepared. Please refresh.");
    const plan = await getTripPlan(tripId, db);
    if (plan.reviewRequired) throw new AppError("CONFLICT", "A payment adjustment needs review before another purchase. Please check your Paddle receipt and payment status.");
    const band = PREMIUM_BANDS.find(b => b.id === bandId);
    if (!band || band.capacity < plan.people) throw new AppError("VALIDATION", "Choose a Premium option that covers everyone in this trip.");
    const amountMinor = band.priceMinor - plan.creditMinor;
    if (amountMinor <= 0) throw new AppError("CONFLICT", "This group size is already covered. Please refresh your trip.");
    const priceId = c.prices[amountMinor];
    if (!priceId) throw new AppError("NOT_CONFIGURED", "This upgrade is not available yet.");
    return db.premiumCheckout.create({ data: { tripId, buyerId: userId, environment, priceId, amountMinor, targetCapacity: band.capacity } });
  });
  // No automatic retry on create: an ambiguous network failure must never make
  // a second chargeable transaction. The saved intent can recover via webhook.
  const response = paddleTransaction.safeParse(await paddleRequest("/transactions", { items: [{ price_id: intent.priceId, quantity: 1 }], currency_code: "USD", collection_mode: "automatic", custom_data: { checkoutId: intent.id, tripId, environment } }));
  if (!response.success) throw new AppError("UPSTREAM", "Checkout is awaiting confirmation. Please try again later.");
  const tx = response.data;
  await recordVerifiedTransaction(tx);
  return { transactionId: tx.id, clientToken: c.clientToken, environment, reused: false, amountMinor: intent.amountMinor, capacity: intent.targetCapacity };
}

export async function refreshTripPayment(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "manage");
  await rateLimit(`payment-status:${tripId}:${userId}`, 40, 300);
  const pending = await prisma.premiumCheckout.findMany({ where: { tripId, environment: billingEnvironment(), status: "PENDING", transactionId: { not: null } }, take: 3 });
  for (const item of pending) await reconcilePayment(item.transactionId!);
  return billingSummary(userId, tripId);
}

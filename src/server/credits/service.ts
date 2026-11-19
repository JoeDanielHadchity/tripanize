import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { INVITED_PREMIUM_CREDITS, WELCOME_CREDITS } from "@/lib/credits";
import { companyAccount } from "@/server/admin/identity";

type Db = typeof prisma;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type Client = Db | Tx;

export type CreditAction = "plan" | "regenerate" | "restaurants" | "events" | "destination" | "assistant" | "swap" | "packing";
export type HoldRef = "job" | "discovery" | "destination" | "inline";

/** Credits are off until launch: no holds, no grants, nothing changes for anyone. */
export function creditsEnabled() { return currentRuntime().creditsEnabled === true; }

/**
 * Unlimited AI credits: only the company administrator account (verified email set in the private
 * server configuration). No profile field, purchase or admin action can give this to anyone else.
 */
export async function unlimitedCredits(userId: string, db: Client = prisma) { return companyAccount(userId, db); }

/**
 * Whether credits apply to this account: for everyone once launched, and before that only for
 * testers, switched on per account on the Company page. Never for the unlimited account: its AI
 * (and its editors' AI on its trips) is never held or charged.
 */
export async function creditsActiveFor(userId: string, db: Client = prisma) {
  if (await unlimitedCredits(userId, db)) return false;
  if (creditsEnabled()) return true;
  return (await db.user.findUnique({ where: { id: userId }, select: { creditsTester: true } }))?.creditsTester === true;
}

/**
 * Starting credits, granted lazily the first time an account's credits are looked at, so nothing
 * depends on a sign-up hook: 15 welcome credits for a verified account, and 500 once for every
 * account invited to Premium (trial invitations, accepted or still open). Verified emails only,
 * so throwaway accounts can't collect them. Each grant is recorded once (dedupe key).
 */
export async function ensureStartingCredits(userId: string, db: Client = prisma) {
  if (!await creditsActiveFor(userId, db)) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  if (!user) return;
  await grant(userId, WELCOME_CREDITS, { kind: "welcome", dedupeKey: `welcome:${userId}`, note: "Welcome credits" }, db);
  // The Premium thank-you and credit gifts match by email, so only a verified email can claim them.
  if (!user.emailVerified) return;
  await claimCreditGifts(userId, user.email, db);
  const invited = await db.trialInvitation.findFirst({ where: { revokedAt: null, OR: [{ acceptedById: userId }, { email: user.email.toLowerCase() }] }, select: { id: true } });
  if (invited) await grant(userId, INVITED_PREMIUM_CREDITS, { kind: "grant", dedupeKey: `invited-premium:${userId}`, note: "Thank-you credits for Premium members" }, db);
}

/** Credit gifts for this email that nobody has claimed yet: each is added once (dedupe key) and marked claimed. */
export async function claimCreditGifts(userId: string, email: string, db: Client = prisma) {
  const gifts = await db.creditGift.findMany({ where: { email: email.trim().toLowerCase(), claimedAt: null }, orderBy: { createdAt: "asc" } });
  for (const g of gifts) {
    const claimed = await db.creditGift.updateMany({ where: { id: g.id, claimedAt: null }, data: { claimedById: userId, claimedAt: new Date() } });
    if (claimed.count) await grant(userId, g.amount, { kind: "grant", dedupeKey: `gift:${g.id}`, note: g.note || "Credits from Tripanize", createdById: g.createdById }, db);
  }
}

/** Adds credits once per dedupe key (purchases, grants, welcome credits). Returns false if already recorded. */
export async function grant(userId: string, amount: number, opts: { kind: "welcome" | "purchase" | "grant" | "adjust"; dedupeKey?: string; note?: string; tripId?: string; createdById?: string }, db: Client = prisma) {
  if (!Number.isInteger(amount) || amount === 0) throw new AppError("VALIDATION", "Enter a whole number of credits.");
  if (opts.dedupeKey && await db.creditEntry.findUnique({ where: { dedupeKey: opts.dedupeKey }, select: { id: true } })) return false;
  await db.creditEntry.create({ data: { userId, amount, kind: opts.kind, note: opts.note ?? null, tripId: opts.tripId ?? null, dedupeKey: opts.dedupeKey ?? null, createdById: opts.createdById ?? null } });
  return true;
}

/** Credits the account can spend now: everything added, minus everything spent, minus actions still running. */
export async function balance(userId: string, db: Client = prisma) {
  await ensureStartingCredits(userId, db);
  const [entries, held] = await Promise.all([
    db.creditEntry.aggregate({ where: { userId }, _sum: { amount: true } }),
    db.creditHold.aggregate({ where: { userId, status: "held", wallet: false }, _sum: { credits: true } }),
  ]);
  return (entries._sum.amount ?? 0) - (held._sum.credits ?? 0);
}

/**
 * Who pays for an AI action: the account itself, or for a trip editor the trip's organizer, unless
 * the organizer switched off "Members can use my credits" for that trip.
 */
export async function payerFor(actorId: string, tripId: string | null, db: Client = prisma, opts: { enforceSwitch?: boolean } = {}) {
  if (!tripId) return actorId;
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { ownerId: true, membersUseCredits: true } });
  if (!trip || trip.ownerId === actorId) return actorId;
  // Viewers (read-only members) never spend the organizer's credits; what little AI they can use is on their own.
  const role = (await db.tripMembership.findFirst({ where: { tripId, userId: actorId }, select: { role: true } }))?.role;
  if (role !== "COLLABORATOR") return actorId;
  if (!trip.membersUseCredits && opts.enforceSwitch !== false) throw new AppError("FORBIDDEN", "The organizer has turned off AI for members on this trip. Ask them to turn it on in Trip settings.");
  return trip.ownerId;
}

/**
 * Reserves credits for an AI action before it runs. Throws CREDITS when the payer can't afford it,
 * with the price and balance so the screen can offer bundles. Returns null when credits are off or
 * the action is free.
 */
export async function hold(input: { actorId: string; tripId?: string | null; action: CreditAction; credits: number; refKind: HoldRef; refId?: string | null }, db: Client = prisma) {
  if (input.credits <= 0) return null;
  // Only once credits apply to the paying account does the organizer's members switch matter.
  if (!await creditsActiveFor(await payerFor(input.actorId, input.tripId ?? null, db, { enforceSwitch: false }), db)) return null;
  const userId = await payerFor(input.actorId, input.tripId ?? null, db);
  // A trip with its own credits pays from them, and only from them: when they run out the organizer
  // decides whether to move more over from their account balance.
  if (input.tripId && await walletPays(input.tripId, userId, db)) {
    const left = await walletBalance(input.tripId, db);
    if (left < input.credits) {
      const bank = Math.max(0, await balance(userId, db));
      const owner = userId === input.actorId;
      throw new AppError("CREDITS", owner
        ? `This trip is out of credits (${Math.max(0, left)} left). Add credits to the trip from your balance (you have ${bank}).`
        : `This trip is out of credits. Ask the organizer to add credits to the trip.`,
        { needed: input.credits, balance: Math.max(0, left), wallet: true, bank: owner ? bank : undefined, tripId: input.tripId, payerIsYou: owner });
    }
    return db.creditHold.create({ data: { userId, actorId: input.actorId, tripId: input.tripId, action: input.action, credits: input.credits, refKind: input.refKind, refId: input.refId ?? null, wallet: true } });
  }
  const available = await balance(userId, db);
  if (available < input.credits) {
    const yours = userId === input.actorId;
    throw new AppError("CREDITS", yours ? `Not enough credits for this. You have ${Math.max(0, available)} left.` : `The organizer doesn't have enough credits left for this.`, { needed: input.credits, balance: Math.max(0, available), payerIsYou: yours });
  }
  return db.creditHold.create({ data: { userId, actorId: input.actorId, tripId: input.tripId ?? null, action: input.action, credits: input.credits, refKind: input.refKind, refId: input.refId ?? null } });
}

/** Points a hold at the job or search it pays for, once that row exists. */
export async function attachHold(holdId: string | null | undefined, refId: string, db: Client = prisma) {
  if (holdId) await db.creditHold.update({ where: { id: holdId }, data: { refId } });
}

/** Spends or releases a hold, once: a settled hold is never settled again. */
export async function settle(holdId: string | null | undefined, outcome: "spent" | "refunded", db: Client = prisma) {
  if (!holdId) return;
  const h = await db.creditHold.findUnique({ where: { id: holdId } });
  if (!h || h.status !== "held") return;
  const done = await db.creditHold.updateMany({ where: { id: holdId, status: "held" }, data: { status: outcome, settledAt: new Date() } });
  if (!done.count || outcome !== "spent") return;
  if (h.wallet && h.tripId) { await db.tripCreditEntry.create({ data: { tripId: h.tripId, amount: -h.credits, kind: "spend", note: h.action, userId: h.actorId, holdId: h.id } }); return; }
  await db.creditEntry.create({ data: { userId: h.userId, amount: -h.credits, kind: "spend", note: h.action, tripId: h.tripId, holdId: h.id, createdById: h.actorId } });
}

/**
 * Runs a synchronous AI action under a hold: spent when it succeeds, refunded when it throws.
 */
export async function withCredits<T>(input: { actorId: string; tripId?: string | null; action: CreditAction; credits: number }, run: () => Promise<T>): Promise<T> {
  const h = await hold({ ...input, refKind: "inline" });
  try {
    const result = await run();
    await settle(h?.id, "spent");
    return result;
  } catch (error) {
    await settle(h?.id, "refunded");
    throw error;
  }
}

const SUCCEEDED = new Set(["SUCCEEDED", "succeeded"]);
const ENDED_WITHOUT_RESULT = new Set(["FAILED", "CANCELLED", "failed", "cancelled"]);

async function refStatus(refKind: string, refId: string | null, db: Client): Promise<string | null> {
  if (!refId) return null;
  if (refKind === "job") return (await db.generationJob.findUnique({ where: { id: refId }, select: { status: true } }))?.status ?? "CANCELLED";
  if (refKind === "discovery") return (await db.discoveryRun.findUnique({ where: { id: refId }, select: { status: true } }))?.status ?? "cancelled";
  if (refKind === "destination") {
    const s = await db.destinationSearch.findUnique({ where: { id: refId }, select: { status: true } });
    return s?.status ?? "CANCELLED";
  }
  return null;
}

/** Settles the holds of one job or search once it has finished: success spends, failure or cancellation refunds. */
export async function settleRef(refKind: HoldRef, refId: string, db: Client = prisma) {
  const holds = await db.creditHold.findMany({ where: { refKind, refId, status: "held" }, select: { id: true } });
  if (!holds.length) return;
  const status = await refStatus(refKind, refId, db);
  if (!status) return;
  for (const h of holds) {
    if (SUCCEEDED.has(status)) await settle(h.id, "spent", db);
    else if (ENDED_WITHOUT_RESULT.has(status)) await settle(h.id, "refunded", db);
  }
}

/**
 * Safety net, run by the hourly maintenance: settles holds whose job finished without settling them,
 * and refunds holds left behind by an interruption (no job attached, or an inline action that never ended).
 */
export async function settleOpenHolds(now = new Date(), db: Client = prisma) {
  const stale = new Date(now.getTime() - 30 * 60_000);
  const open = await db.creditHold.findMany({ where: { status: "held", createdAt: { lt: new Date(now.getTime() - 60_000) } }, take: 500 });
  for (const h of open) {
    if (h.refKind === "inline" || !h.refId) { if (h.createdAt < stale) await settle(h.id, "refunded", db); continue; }
    await settleRef(h.refKind as HoldRef, h.refId, db);
  }
}

/** An account's credit history, newest first, for the account page and the Company page. */
export async function creditHistory(userId: string, take = 50, db: Client = prisma) {
  return db.creditEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export type CreditsView = { active: boolean; balance: number; payerIsYou: boolean; membersBlocked: boolean; unlimited?: boolean; /** On a trip with its own credits: balance is the trip's, bank the organizer's account. */ wallet?: boolean; bank?: number };
/**
 * What the screens need: whether credits apply, and the balance that pays for this person's AI
 * (on a trip: the organizer's, for an editor). Never throws for a blocked member; it reports it.
 */
export async function creditsView(userId: string, tripId?: string | null, db: Client = prisma): Promise<CreditsView> {
  const payer = await payerFor(userId, tripId ?? null, db, { enforceSwitch: false });
  if (!await creditsActiveFor(payer, db)) return { active: false, balance: 0, payerIsYou: payer === userId, membersBlocked: false, unlimited: await unlimitedCredits(payer, db) };
  let membersBlocked = false;
  try { await payerFor(userId, tripId ?? null, db); } catch { membersBlocked = true; }
  if (tripId && await walletPays(tripId, payer, db)) {
    return { active: true, balance: Math.max(0, await walletBalance(tripId, db)), payerIsYou: payer === userId, membersBlocked, wallet: true, ...(payer === userId ? { bank: Math.max(0, await balance(payer, db)) } : {}) };
  }
  return { active: true, balance: Math.max(0, await balance(payer, db)), payerIsYou: payer === userId, membersBlocked };
}

/** Spending on one trip, per person, for the organizer's Trip settings. */
export async function tripCreditSpending(tripId: string, db: Client = prisma) {
  const [bank, wallet] = await Promise.all([
    db.creditEntry.groupBy({ by: ["createdById"], where: { tripId, kind: "spend" }, _sum: { amount: true }, _count: true }),
    db.tripCreditEntry.groupBy({ by: ["userId"], where: { tripId, kind: "spend" }, _sum: { amount: true }, _count: true }),
  ]);
  const totals = new Map<string | null, { actions: number; credits: number }>();
  for (const [id, count, sum] of [...bank.map(s => [s.createdById, s._count, s._sum.amount] as const), ...wallet.map(s => [s.userId, s._count, s._sum.amount] as const)]) {
    const t = totals.get(id) ?? { actions: 0, credits: 0 }; t.actions += count; t.credits -= sum ?? 0; totals.set(id, t);
  }
  const users = await db.user.findMany({ where: { id: { in: [...totals.keys()].filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } });
  return [...totals].map(([userId, t]) => ({ userId, name: users.find(u => u.id === userId)?.name ?? "Someone", ...t })).sort((a, b) => b.credits - a.credits);
}

/** Whether a trip's AI is paid with credits: credits apply to its organizer's account. */
export async function creditsCoverTrip(tripId: string, db: Client = prisma) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  return Boolean(trip && await creditsActiveFor(trip.ownerId, db));
}

/** The organizer's "Members can use my credits" switch for one trip. */
export async function setMembersUseCredits(userId: string, tripId: string, on: boolean) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  if (!trip) throw new AppError("NOT_FOUND", "Trip not found.");
  if (trip.ownerId !== userId) throw new AppError("FORBIDDEN", "Only the organizer can change who uses their credits.");
  await prisma.trip.update({ where: { id: tripId }, data: { membersUseCredits: on } });
}


// ---- Trip wallets -------------------------------------------------------------------------------

/** Whether a trip has its own credits (it was given some: Premium with credits or money, or a top-up). */
export async function hasWallet(tripId: string, db: Client = prisma) {
  return Boolean(await db.tripCreditEntry.findFirst({ where: { tripId }, select: { id: true } }));
}
/** The trip's wallet pays when it exists and the payer is the trip's organizer (whose credits these are). */
async function walletPays(tripId: string, payerId: string, db: Client) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  return Boolean(trip && trip.ownerId === payerId && await hasWallet(tripId, db));
}
/** Credits the trip can spend now: everything put in, minus everything spent, minus actions still running. */
export async function walletBalance(tripId: string, db: Client = prisma) {
  const [entries, held] = await Promise.all([
    db.tripCreditEntry.aggregate({ where: { tripId }, _sum: { amount: true } }),
    db.creditHold.aggregate({ where: { tripId, status: "held", wallet: true }, _sum: { credits: true } }),
  ]);
  return (entries._sum.amount ?? 0) - (held._sum.credits ?? 0);
}

/**
 * Moves credits from the organizer's account balance into one of their trips. Only ever done when the
 * organizer asks; the balance is checked in the same transaction that moves it.
 */
export async function topUpTrip(userId: string, tripId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000) throw new AppError("VALIDATION", "Enter a whole number of credits.");
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { ownerId: true, name: true } });
  if (!trip) throw new AppError("NOT_FOUND", "Trip not found.");
  if (trip.ownerId !== userId) throw new AppError("FORBIDDEN", "Only the trip organizer can add credits to this trip.");
  if (!await creditsActiveFor(userId)) throw new AppError("FORBIDDEN", "Credits aren't available on your account yet.");
  await prisma.$transaction(async db => {
    const bank = await balance(userId, db);
    if (bank < amount) throw new AppError("CREDITS", `You have ${Math.max(0, bank)} credits in your balance. Top up your account first, or add fewer.`, { needed: amount, balance: Math.max(0, bank) });
    await db.creditEntry.create({ data: { userId, amount: -amount, kind: "transfer", note: "trip-topup", tripId, createdById: userId } });
    await db.tripCreditEntry.create({ data: { tripId, amount, kind: "topup", note: "Added from your balance", userId } });
  });
  return { trip: Math.max(0, await walletBalance(tripId)), bank: Math.max(0, await balance(userId)) };
}

/** A trip's credits for its screens: balance, the organizer's account balance, and the latest moves. */
export async function tripWallet(userId: string, tripId: string, db: Client = prisma) {
  const trip = await db.trip.findUnique({ where: { id: tripId }, select: { ownerId: true } });
  if (!trip) throw new AppError("NOT_FOUND", "Trip not found.");
  const owner = trip.ownerId === userId;
  const active = await creditsActiveFor(trip.ownerId, db);
  const exists = active && await hasWallet(tripId, db);
  return {
    active, exists, owner,
    balance: exists ? Math.max(0, await walletBalance(tripId, db)) : 0,
    bank: active && owner ? Math.max(0, await balance(userId, db)) : null,
    history: exists ? await db.tripCreditEntry.findMany({ where: { tripId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, amount: true, kind: true, note: true, createdAt: true } }) : [],
  };
}

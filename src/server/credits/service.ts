import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { INVITED_PREMIUM_CREDITS, WELCOME_CREDITS } from "@/lib/credits";

type Db = typeof prisma;
type Tx = Parameters<Parameters<Db["$transaction"]>[0]>[0];
type Client = Db | Tx;

export type CreditAction = "plan" | "regenerate" | "restaurants" | "events" | "destination" | "assistant" | "swap" | "packing";
export type HoldRef = "job" | "discovery" | "destination" | "inline";

/** Credits are off until launch: no holds, no grants, nothing changes for anyone. */
export function creditsEnabled() { return currentRuntime().creditsEnabled === true; }

/**
 * Whether credits apply to this account: for everyone once launched, and before that only for
 * testers, switched on per account on the Company page.
 */
export async function creditsActiveFor(userId: string, db: Client = prisma) {
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
  // The Premium thank-you matches invitations by email, so only a verified email can claim it.
  if (!user.emailVerified) return;
  const invited = await db.trialInvitation.findFirst({ where: { revokedAt: null, OR: [{ acceptedById: userId }, { email: user.email.toLowerCase() }] }, select: { id: true } });
  if (invited) await grant(userId, INVITED_PREMIUM_CREDITS, { kind: "grant", dedupeKey: `invited-premium:${userId}`, note: "Thank-you credits for Premium members" }, db);
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
    db.creditHold.aggregate({ where: { userId, status: "held" }, _sum: { credits: true } }),
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
  const available = await balance(userId, db);
  if (available < input.credits) {
    const yours = userId === input.actorId;
    throw new AppError("CREDITS", yours ? `This uses ${input.credits} credits. You have ${Math.max(0, available)}.` : `This uses ${input.credits} of the organizer's credits, and they have ${Math.max(0, available)} left.`, { needed: input.credits, balance: Math.max(0, available), payerIsYou: yours });
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

export type CreditsView = { active: boolean; balance: number; payerIsYou: boolean; membersBlocked: boolean };
/**
 * What the screens need: whether credits apply, and the balance that pays for this person's AI
 * (on a trip: the organizer's, for an editor). Never throws for a blocked member; it reports it.
 */
export async function creditsView(userId: string, tripId?: string | null, db: Client = prisma): Promise<CreditsView> {
  const payer = await payerFor(userId, tripId ?? null, db, { enforceSwitch: false });
  if (!await creditsActiveFor(payer, db)) return { active: false, balance: 0, payerIsYou: payer === userId, membersBlocked: false };
  let membersBlocked = false;
  try { await payerFor(userId, tripId ?? null, db); } catch { membersBlocked = true; }
  return { active: true, balance: Math.max(0, await balance(payer, db)), payerIsYou: payer === userId, membersBlocked };
}

/** Spending on one trip, per person, for the organizer's Trip settings. */
export async function tripCreditSpending(tripId: string, db: Client = prisma) {
  const spent = await db.creditEntry.groupBy({ by: ["createdById"], where: { tripId, kind: "spend" }, _sum: { amount: true }, _count: true });
  const users = await db.user.findMany({ where: { id: { in: spent.map(s => s.createdById).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } });
  return spent.map(s => ({ userId: s.createdById, name: users.find(u => u.id === s.createdById)?.name ?? "Someone", actions: s._count, credits: -(s._sum.amount ?? 0) })).sort((a, b) => b.credits - a.credits);
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

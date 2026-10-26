import { adminAudit } from "./audit";
import { billingEnvironment } from "@/server/billing/config";
import { OPERATOR_NAME } from "@/lib/legal";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireCompanyAdmin, companyAccount } from "./identity";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { rateLimit } from "@/server/ratelimit";
import { createTrip } from "@/server/trips/service";
import { getTripPlan } from "@/server/plans/access";
import { recordChange } from "@/server/audit";
import { sendEmail } from "@/server/notifications/email";
import { invitationOrigin } from "@/lib/invitation-urls";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const emailInput = z.string().trim().toLowerCase().email().max(254);
const claimInput = z.object({ invitationId: z.string().min(1).max(64), tripId: z.string().min(1).max(64).optional(), name: z.string().trim().min(1).max(120).optional() }).strict();
const subject = `${OPERATOR_NAME} invited you to try Tripanize Premium for one trip`;
const invitationOpen = { acceptedAt: null, revokedAt: null };

export async function createTrialInvitation(actorId: string, email: string, durationDays: number | null = 14) {
  await requireCompanyAdmin(actorId);
  if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365)) throw new AppError("VALIDATION", "Choose a trial duration between 1 and 365 days.");
  const parsed = emailInput.safeParse(email);
  if (!parsed.success) throw new AppError("VALIDATION", "Enter a valid recipient email.");
  const recipient = parsed.data;
  const actor = await prisma.user.findUniqueOrThrow({ where: { id: actorId } });
  if (recipient === actor.email.toLowerCase()) throw new AppError("VALIDATION", `Your ${OPERATOR_NAME} administrator account already has all access.`);
  await rateLimit(`trial-invite:${actorId}`, 50, 3600, "Please wait before creating more trial invitations.");
  const token = randomBytes(32).toString("base64url");
  const url = `${invitationOrigin(currentRuntime().appUrl ?? process.env.APP_URL ?? "http://localhost:3000")}/trial/${token}`;
  const expiresAt = new Date(Date.now() + 14 * 86400_000);
  const emailText = `${OPERATOR_NAME} invited you to try every Tripanize Premium feature for one trip, free of charge.\n\nAccept your invitation:\n${url}\n\nSign in with ${recipient} and verify your email using an email sign-in code. Then choose one trip you organize, or create a new trial trip. The invitation can only be used once and expires in 14 days.\n\nYour trial covers that trip and its members${durationDays === null ? " until revoked" : ` for ${durationDays} days after activation`}. It is not a subscription, needs no payment details, and never charges automatically. ${OPERATOR_NAME} can revoke trial access. Other trips keep their usual plans.\n\nIf you were not expecting this invitation, you can ignore it.`;
  const inv = await prisma.$transaction(async tx => {
    await requireCompanyAdmin(actorId, tx);
    await tx.trialInvitation.updateMany({ where: { email: recipient, ...invitationOpen, expiresAt: { lte: new Date() } }, data: { revokedAt: new Date(), activeEmail: null, emailStatus: "cancelled", nextEmailAttemptAt: null } });
    await tx.trialInvitation.updateMany({ where: { email: recipient, revokedAt: null, trialEndsAt: { lte: new Date() } }, data: { revokedAt: new Date(), activeEmail: null } });
    if (await tx.trialInvitation.findUnique({ where: { activeEmail: recipient } })) throw new AppError("CONFLICT", "This person already has a trial or an open invitation. Revoke it before inviting them again.");
    const user = await tx.user.findUnique({ where: { email: recipient } });
    if (user && await tx.trialInvitation.findFirst({ where: { acceptedById: user.id, acceptedAt: { not: null }, revokedAt: null, OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: new Date() } }] } })) throw new AppError("CONFLICT", "This person already has a trial. Revoke it before inviting them again.");
    const invitation = await tx.trialInvitation.create({ data: { email: recipient, activeEmail: recipient, tokenHash: tokenHash(token), createdById: actorId, expiresAt, durationDays, emailText, nextEmailAttemptAt: new Date() } });
    await adminAudit(actorId, "trial.created", "trial", invitation.id, { durationDays }, tx);
    return invitation;
  });
  await currentRuntime().wakeNotifications?.();
  return { id: inv.id, url, expiresAt: expiresAt.toISOString() };
}

export async function listCompanyTrials(actorId: string) {
  await requireCompanyAdmin(actorId);
  const rows = await prisma.trialInvitation.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { id: true, email: true, createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true, tripId: true, trip: { select: { name: true, premiumCheckouts: { where: { environment: billingEnvironment(), status: "COMPLETED", reviewRequired: false }, take: 1, select: { id: true } } } }, emailStatus: true, trialEndsAt: true, durationDays: true } });
  return rows.map(r => ({ id: r.id, email: r.email, tripName: r.trip?.name ?? null, tripId: r.tripId, createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), trialEndsAt: r.trialEndsAt?.toISOString() ?? null, durationDays: r.durationDays, converted: Boolean(r.trip?.premiumCheckouts.length),
    status: r.revokedAt ? "Revoked" : r.acceptedAt ? r.tripId ? r.trialEndsAt && r.trialEndsAt <= new Date() ? "Expired trial" : "Active trial" : "Trip deleted" : r.expiresAt < new Date() ? "Expired" : "Invitation pending", emailStatus: r.emailStatus }));
}

export async function revokeTrialInvitation(actorId: string, invitationId: string) {
  await requireCompanyAdmin(actorId);
  if (typeof invitationId !== "string" || invitationId.length > 64) throw new AppError("VALIDATION", "Choose an invitation.");
  await prisma.$transaction(async tx => {
    await requireCompanyAdmin(actorId, tx);
    const inv = await tx.trialInvitation.findUnique({ where: { id: invitationId } });
    if (!inv) throw new AppError("NOT_FOUND", "Invitation not found.");
    if (inv.revokedAt) return;
    await tx.trialInvitation.update({ where: { id: inv.id }, data: { revokedAt: new Date(), activeEmail: null, ...(inv.emailStatus === "queued" ? { emailStatus: "cancelled", nextEmailAttemptAt: null } : {}) } });
    await adminAudit(actorId, "trial.revoked", "trial", inv.id, {}, tx);
    if (inv.tripId) await recordChange(tx, { tripId: inv.tripId, actorId, entity: "trial", entityId: inv.id, action: "revoke" });
  });
}

export async function previewTrialInvitation(token: string) {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const inv = await prisma.trialInvitation.findUnique({ where: { tokenHash: tokenHash(token) }, select: { id: true, email: true, expiresAt: true, acceptedAt: true, revokedAt: true, durationDays: true } });
  if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt <= new Date()) return null;
  return { id: inv.id, maskedEmail: inv.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2"), expiresAt: inv.expiresAt.toISOString(), durationDays: inv.durationDays };
}

export async function pendingTrialInvitations(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.emailVerified || user.suspendedAt) return [];
  return prisma.trialInvitation.findMany({ where: { email: user.email.toLowerCase(), ...invitationOpen, expiresAt: { gt: new Date() } }, select: { id: true, durationDays: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: 10 });
}

export type UserTrialAccess =
  | { status: "none" | "verify" }
  | { status: "available"; invitationId: string; durationDays: number | null; acceptBy: string }
  | { status: "active"; invitationId: string; tripId: string; tripName: string; endsAt: string | null };

/** Discover a recipient's own trial on every normal entry point. Never expose an
 * invitation ID to an unverified address, or another member's private trip name.
 */
export async function userTrialAccess(userId: string): Promise<UserTrialAccess> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, emailVerified: true, suspendedAt: true } });
  if (user.suspendedAt) return { status: "none" };
  if (!user.emailVerified) return { status: "verify" };
  const pending = await prisma.trialInvitation.findFirst({ where: { email: user.email.toLowerCase(), ...invitationOpen, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, select: { id: true, durationDays: true, expiresAt: true } });
  if (pending) return { status: "available", invitationId: pending.id, durationDays: pending.durationDays, acceptBy: pending.expiresAt.toISOString() };
  const active = await prisma.trialInvitation.findFirst({ where: { acceptedById: userId, acceptedAt: { not: null }, revokedAt: null, OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: new Date() } }], trip: { memberships: { some: { userId } } } }, select: { id: true, tripId: true, trialEndsAt: true, trip: { select: { id: true, name: true } } } });
  if (active?.trip && (await getTripPlan(active.trip.id)).source === "trial") return { status: "active", invitationId: active.id, tripId: active.trip.id, tripName: active.trip.name, endsAt: active.trialEndsAt?.toISOString() ?? null };
  return { status: "none" };
}

/** A redeemed email link should reopen the recipient's trial, not an unavailable
 * invitation page. This resolves only their own, verified, still-accessible trip.
 */
export async function redeemedTrialTrip(userId: string, token?: string, invitationId?: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerified: true, suspendedAt: true } });
  if (!user.emailVerified || user.suspendedAt || (!token && !invitationId)) return null;
  if (token && !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const invitation = await prisma.trialInvitation.findFirst({ where: { ...(token ? { tokenHash: tokenHash(token) } : { id: invitationId }), acceptedById: userId, acceptedAt: { not: null }, trip: { memberships: { some: { userId } } } }, select: { tripId: true } });
  return invitation?.tripId ?? null;
}

export async function trialTripChoices(userId: string) {
  const trips = await prisma.trip.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const choices = [];
  for (const t of trips) if (!(await getTripPlan(t.id)).premium) choices.push(t);
  return choices;
}

/** Single-use claim, verified recipient and trip ownership are checked in the same
 * transaction as creating the trip/grant. No checkout or account entitlement is written.
 */
export async function acceptTrialInvitation(userId: string, input: z.input<typeof claimInput>) {
  const parsed = claimInput.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Choose one trip or enter a name for a new trial trip.");
  const { invitationId, tripId: chosen, name } = parsed.data;
  await rateLimit(`trial-accept:${userId}`, 20, 3600);
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.suspendedAt) throw new AppError("FORBIDDEN", "This account cannot activate a trial.");
    if (!user.emailVerified) throw new AppError("FORBIDDEN", "Verify your email by signing in with an email code before accepting a trial.");
    const inv = await tx.trialInvitation.findUnique({ where: { id: invitationId } });
    if (!inv || inv.email !== user.email.toLowerCase()) throw new AppError("NOT_FOUND", "This invitation is not available for your account.");
    if (inv.revokedAt || (!inv.acceptedAt && inv.expiresAt <= new Date())) throw new AppError("CONFLICT", "This trial invitation has expired or was revoked.");
    if (inv.acceptedAt) {
      if (inv.acceptedById === userId && inv.tripId && await tx.trip.findFirst({ where: { id: inv.tripId, memberships: { some: { userId } } } })) {
        if (chosen && chosen !== inv.tripId) throw new AppError("CONFLICT", "Your trial is already active on another trip. Open that trip from your trial banner.");
        return { tripId: inv.tripId };
      }
      throw new AppError("CONFLICT", "This invitation has already been used.");
    }
    if (await tx.trialInvitation.findFirst({ where: { acceptedById: userId, acceptedAt: { not: null }, revokedAt: null, OR: [{ trialEndsAt: null }, { trialEndsAt: { gt: new Date() } }] } })) throw new AppError("CONFLICT", "You already have an active trial for one trip.");
    let tripId = chosen;
    if (tripId) {
      if (!await tx.trip.findFirst({ where: { id: tripId, ownerId: userId } })) throw new AppError("NOT_FOUND", "Choose a trip you organize.");
      if ((await getTripPlan(tripId, tx)).premium) throw new AppError("CONFLICT", "This trip already has Premium. Choose a Normal trip.");
      // Keep a revoked grant's trip binding: an old invitation never moves to another trip.
      if (await tx.trialInvitation.findUnique({ where: { tripId } })) throw new AppError("CONFLICT", "This trip has already received a trial. Choose a different trip.");
    } else {
      if (!name) throw new AppError("VALIDATION", "Enter a name for your trial trip.");
      tripId = await createTrip(userId, { name }, undefined, tx);
      await tx.trip.update({ where: { id: tripId }, data: { onboardingStage: "DETAILS" } });
    }
    const claimed = await tx.trialInvitation.updateMany({ where: { id: inv.id, ...invitationOpen, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date(), acceptedById: userId, tripId, trialEndsAt: inv.durationDays ? new Date(Date.now() + inv.durationDays * 86400_000) : null, ...(inv.emailStatus === "queued" ? { emailStatus: "cancelled", nextEmailAttemptAt: null } : {}) } });
    if (!claimed.count) throw new AppError("CONFLICT", "This invitation has already been used.");
    const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId } });
    await tx.trip.update({ where: { id: tripId }, data: { onboardingPlan: "PREMIUM", ...(trip.onboardingStage === "PLAN" ? { onboardingStage: "DETAILS" } : {}) } });
    await recordChange(tx, { tripId, actorId: inv.createdById, entity: "trial", entityId: inv.id, action: "create" });
    return { tripId };
  }, { timeout: 30000 });
}

export async function nextTrialEmailAt() {
  return (await prisma.trialInvitation.findFirst({ where: { emailStatus: "queued" }, orderBy: { nextEmailAttemptAt: "asc" }, select: { nextEmailAttemptAt: true } }))?.nextEmailAttemptAt ?? null;
}

/** The native alarm is the sole consumer. Persist attempts before sending; the
 * immutable payload and provider key survive a restart or ambiguous timeout.
 */
export async function sendNextTrialEmail(send = sendEmail, now = new Date()) {
  const inv = await prisma.trialInvitation.findFirst({ where: { emailStatus: "queued", nextEmailAttemptAt: { lte: now } }, orderBy: { nextEmailAttemptAt: "asc" } });
  if (!inv) return false;
  if (inv.revokedAt || inv.acceptedAt || inv.expiresAt <= now || !await companyAccount(inv.createdById)) {
    await prisma.trialInvitation.update({ where: { id: inv.id }, data: { emailStatus: "cancelled", nextEmailAttemptAt: null } }); return true;
  }
  if (inv.firstEmailAttemptAt && now.getTime() - inv.firstEmailAttemptAt.getTime() > 20 * 3600_000) {
    await prisma.trialInvitation.update({ where: { id: inv.id }, data: { emailStatus: "failed", emailError: "Email retry window expired.", nextEmailAttemptAt: null } }); return true;
  }
  const attempts = inv.emailAttempts + 1;
  await prisma.trialInvitation.update({ where: { id: inv.id }, data: { emailAttempts: attempts, firstEmailAttemptAt: inv.firstEmailAttemptAt ?? now } });
  const result = await send({ to: inv.email, subject, text: inv.emailText, idempotencyKey: `trial-invitation/${inv.id}` });
  if (result.status === "sent") await prisma.trialInvitation.update({ where: { id: inv.id }, data: { emailStatus: "sent", emailSentAt: now, emailProviderId: result.providerId, nextEmailAttemptAt: null, emailError: null } });
  else if (result.status === "not_configured") await prisma.trialInvitation.update({ where: { id: inv.id }, data: { emailStatus: "not_configured", nextEmailAttemptAt: null } });
  else {
    const retry = result.retryable !== false && attempts < 6;
    await prisma.trialInvitation.update({ where: { id: inv.id }, data: { emailStatus: retry ? "queued" : "failed", emailError: result.error.slice(0, 200), nextEmailAttemptAt: retry ? new Date(now.getTime() + Math.max(60_000 * 2 ** (attempts - 1), result.retryAfterMs ?? 0)) : null } });
  }
  return true;
}

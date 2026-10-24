import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { companyAccount, hasAdminAuthentication } from "./identity";
import { adminAudit } from "./audit";
import { AppError } from "@/server/errors";
import { sendEmail } from "@/server/notifications/email";

export const ADMIN_UNLOCK_MS = 30 * 60_000;
export const ADMIN_EMAIL_CODE_MS = 10 * 60_000;
const RESEND_MS = 60_000, MAX_FAILURES = 5, LOCK_MS = 15 * 60_000;
export const adminSecurityCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("send-code") }).strict(),
  z.object({ op: z.literal("unlock"), code: z.string().trim().regex(/^\d{6}$/) }).strict(),
  z.object({ op: z.literal("lock") }).strict(),
]);
const cleared = { challengeId: null, codeHash: null, sessionId: null, expiresAt: null, deliveredAt: null };
const codeHash = (userId: string, sessionId: string, challengeId: string, code: string) => createHmac("sha256", currentRuntime().authSecret).update(`admin-email:v1:${userId}:${sessionId}:${challengeId}:${code}`).digest("hex");

async function securitySession(userId: string, db: Pick<Tx, "user" | "session"> = prisma) {
  if (!await companyAccount(userId, db)) throw new AppError("FORBIDDEN", "Admin security is only available to the verified administrator account.");
  const context = currentRuntime().accountMode;
  if (!context?.sessionId || context.userId !== userId) throw new AppError("UNAUTHENTICATED", "Sign in again to unlock Admin mode.");
  const session = await db.session.findFirst({ where: { id: context.sessionId, userId, expiresAt: { gt: new Date() } } });
  if (!session) throw new AppError("UNAUTHENTICATED", "This sign-in has expired. Sign in again.");
  return session;
}
export async function adminSecurityStatus(userId: string) {
  const session = await securitySession(userId);
  const record = await prisma.adminEmailChallenge.findUnique({ where: { userId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const unlocked = await hasAdminAuthentication(userId);
  const codeSent = Boolean(record?.codeHash && record.deliveredAt && record.sessionId === session.id && record.expiresAt && record.expiresAt.getTime() > Date.now());
  return { email: user.email, unlocked, verifiedUntil: unlocked ? session.adminVerifiedUntil!.toISOString() : null,
    codeSent, expiresAt: codeSent ? record!.expiresAt!.toISOString() : null,
    resendAt: record?.requestedAt ? new Date(record.requestedAt.getTime() + RESEND_MS).toISOString() : null,
    lockedUntil: record?.lockedUntil && record.lockedUntil.getTime() > Date.now() ? record.lockedUntil.toISOString() : null };
}

/** Cancel pending codes without resetting the account-wide retry limit or lockout. */
export async function invalidateAdminEmailChallenge(db: Pick<Tx, "adminEmailChallenge">, userId: string, sessionId: string) {
  await db.adminEmailChallenge.updateMany({ where: { userId, sessionId }, data: cleared });
}

/** Dedicated, session-bound admin verification. General sign-in codes, legacy
 * authenticator codes and recovery codes cannot authorize administrator powers.
 */
export async function executeAdminSecurity(userId: string, input: z.input<typeof adminSecurityCommand>, deliver = sendEmail) {
  const command = adminSecurityCommand.parse(input);
  const session = await securitySession(userId);
  if (command.op === "lock") {
    await prisma.$transaction(async db => {
      await securitySession(userId, db);
      await db.session.updateMany({ where: { id: session.id, userId }, data: { adminVerifiedUntil: null, adminEmailUnlockedAt: null } });
      await invalidateAdminEmailChallenge(db, userId, session.id);
      await adminAudit(userId, "admin.authentication.locked", "user", userId, {}, db);
    });
    return { ok: true as const };
  }
  if (command.op === "send-code") {
    const value = randomInt(0, 1_000_000).toString().padStart(6, "0"), challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + ADMIN_EMAIL_CODE_MS);
    const prepared = await prisma.$transaction(async db => {
      await securitySession(userId, db);
      const record = await db.adminEmailChallenge.findUnique({ where: { userId } });
      if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) throw new AppError("RATE_LIMITED", "Too many incorrect codes. Wait until the 15-minute lock expires before requesting a new code.");
      if (record?.requestedAt && Date.now() - record.requestedAt.getTime() < RESEND_MS) throw new AppError("RATE_LIMITED", "Please wait 60 seconds before requesting another admin code.");
      const key = `admin-email-send:${userId}`;
      if (await db.rateLimitHit.count({ where: { key, createdAt: { gte: new Date(Date.now() - 3600_000) } } }) >= 5) throw new AppError("RATE_LIMITED", "You have requested five admin codes this hour. Please wait before requesting another.");
      await db.rateLimitHit.create({ data: { key } });
      const data = { challengeId, codeHash: codeHash(userId, session.id, challengeId, value), sessionId: session.id, expiresAt, requestedAt: new Date(), deliveredAt: null, ...(record?.lockedUntil ? { failedAttempts: 0, lockedUntil: null } : {}) };
      await db.adminEmailChallenge.upsert({ where: { userId }, create: { userId, ...data }, update: data });
      const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
      return { email: user.email, resendAt: new Date(Date.now() + RESEND_MS).toISOString() };
    });
    // The raw code exists only in memory and in the email delivered to the owner.
    // Do not log it, return it to the client, or persist it in an email outbox.
    let sent = false;
    try {
      const result = await deliver({ to: prepared.email, subject: "Your Tripanize.app Admin access code", text: `Your Tripanize.app Admin access code is ${value}\n\nEnter it on the Admin access page in the same browser session within 10 minutes. It can be used once and unlocks Admin mode for 30 minutes.\n\nDo not share this code. If you did not request Admin access, ignore this email.`, idempotencyKey: `admin-email/${challengeId}` });
      sent = result.status === "sent";
    } catch { /* Delivery errors must never include the raw code in responses or logs. */ }
    if (!sent) {
      await prisma.$transaction(async db => {
        await db.adminEmailChallenge.updateMany({ where: { userId, challengeId }, data: cleared });
        await adminAudit(userId, "admin.authentication.email_failed", "user", userId, {}, db);
      });
      throw new AppError("UPSTREAM", "Your admin code could not be sent. Wait 60 seconds, then try again.");
    }
    await prisma.$transaction(async db => {
      await securitySession(userId, db);
      const updated = await db.adminEmailChallenge.updateMany({ where: { userId, challengeId, sessionId: session.id, expiresAt: { gt: new Date() } }, data: { deliveredAt: new Date() } });
      if (!updated.count) throw new AppError("CONFLICT", "This request was replaced or canceled. Request a fresh admin code.");
      await adminAudit(userId, "admin.authentication.email_sent", "user", userId, {}, db);
    });
    return { ok: true as const, expiresAt: expiresAt.toISOString(), resendAt: prepared.resendAt };
  }
  // Commit wrong-attempt counters before returning the public validation error.
  const result = await prisma.$transaction(async db => {
    await securitySession(userId, db);
    const record = await db.adminEmailChallenge.findUnique({ where: { userId } });
    if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) return { error: "locked" as const };
    if (!record?.codeHash || !record.challengeId || !record.deliveredAt || record.sessionId !== session.id || !record.expiresAt || record.expiresAt.getTime() <= Date.now()) return { error: "expired" as const };
    const expected = Buffer.from(codeHash(userId, session.id, record.challengeId, command.code), "hex");
    const stored = Buffer.from(record.codeHash, "hex");
    if (stored.length !== expected.length || !timingSafeEqual(stored, expected)) {
      const failures = record.failedAttempts + 1, locked = failures >= MAX_FAILURES;
      await db.adminEmailChallenge.update({ where: { userId }, data: { failedAttempts: failures, ...(locked ? { ...cleared, lockedUntil: new Date(Date.now() + LOCK_MS) } : {}) } });
      await adminAudit(userId, "admin.authentication.failed", "user", userId, { method: "email", locked }, db);
      return { error: locked ? "locked" as const : "invalid" as const };
    }
    const consumed = await db.adminEmailChallenge.updateMany({ where: { userId, challengeId: record.challengeId, codeHash: record.codeHash, sessionId: session.id }, data: { ...cleared, failedAttempts: 0, lockedUntil: null } });
    if (!consumed.count) return { error: "expired" as const };
    const until = new Date(Date.now() + ADMIN_UNLOCK_MS);
    const changed = await db.session.updateMany({ where: { id: session.id, userId, expiresAt: { gt: new Date() } }, data: { adminVerifiedUntil: until, adminEmailUnlockedAt: new Date(), normalMode: false } });
    if (!changed.count) throw new AppError("UNAUTHENTICATED", "Your sign-in expired. Sign in again.");
    await adminAudit(userId, "admin.authentication.unlocked", "user", userId, { method: "email" }, db);
    return { ok: true as const, verifiedUntil: until.toISOString() };
  });
  if ("error" in result) throw new AppError(result.error === "locked" ? "RATE_LIMITED" : "VALIDATION", result.error === "locked" ? "Too many incorrect codes. Admin verification is locked for 15 minutes." : result.error === "expired" ? "Request a new admin email code in this browser. The previous code has expired, was used, or belongs to another session." : "That admin email code is incorrect. Check the most recent email and try again.");
  return result;
}

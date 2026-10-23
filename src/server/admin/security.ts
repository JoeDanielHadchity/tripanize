import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { companyAccount } from "./identity";
import { adminAudit } from "./audit";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";

export const ADMIN_UNLOCK_MS = 30 * 60_000;
const ENROLLMENT_MS = 10 * 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const code = z.string().trim().min(1).max(80);
export const adminSecurityCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("enroll") }).strict(),
  z.object({ op: z.literal("confirm"), code }).strict(),
  z.object({ op: z.literal("unlock"), code, recovery: z.boolean().optional() }).strict(),
  z.object({ op: z.literal("lock") }).strict(),
  z.object({ op: z.literal("recovery-codes"), code }).strict(),
]);
const cipherKey = () => `${currentRuntime().authSecret}:admin-authenticator:v1`;
const recoveryHash = (userId: string, value: string) => createHmac("sha256", currentRuntime().authSecret).update(`admin-recovery:${userId}:${value.replace(/[\s-]/g, "").toUpperCase()}`).digest("hex");
const hashes = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v)) : [];
const newRecoveryCodes = (userId: string) => {
  const codes = Array.from({ length: 10 }, () => randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-"));
  return { codes, hashes: codes.map(value => recoveryHash(userId, value)) };
};

async function securitySession(userId: string, db: Pick<Tx, "user" | "session"> = prisma) {
  if (!await companyAccount(userId, db)) throw new AppError("FORBIDDEN", "Admin security is only available to the verified administrator account.");
  const context = currentRuntime().accountMode;
  if (!context?.sessionId || context.userId !== userId) throw new AppError("UNAUTHENTICATED", "Sign in again to manage admin security.");
  const session = await db.session.findFirst({ where: { id: context.sessionId, userId, expiresAt: { gt: new Date() } } });
  if (!session) throw new AppError("UNAUTHENTICATED", "This sign-in has expired. Sign in again.");
  return session;
}
const freshEmail = (at: Date | null) => Boolean(at && at.getTime() <= Date.now() && Date.now() - at.getTime() < ENROLLMENT_MS);
function requireEnrollmentEmail(at: Date | null) {
  if (!freshEmail(at)) throw new AppError("FORBIDDEN", "Sign in with a fresh email code before setting up or replacing your authenticator.", { emailReauthentication: true });
}
export async function adminSecurityStatus(userId: string) {
  const session = await securitySession(userId);
  const record = await prisma.adminAuthenticator.findUnique({ where: { userId } });
  const enrolled = Boolean(record?.enabledAt && record.encryptedSecret);
  const unlocked = enrolled && !session.normalMode && Boolean(session.adminVerifiedUntil && session.adminVerifiedUntil.getTime() > Date.now());
  return { enrolled, unlocked, verifiedUntil: unlocked ? session.adminVerifiedUntil!.toISOString() : null,
    recoveryRemaining: hashes(record?.recoveryHashes).length, freshEmail: freshEmail(session.adminEmailVerifiedAt),
    lockedUntil: record?.lockedUntil && record.lockedUntil.getTime() > Date.now() ? record.lockedUntil.toISOString() : null };
}

/** Use the same RFC 6238 implementation as Better Auth. Record the matched counter
 * so a valid code cannot unlock two sessions or be reused for another command.
 */
async function matchingCounter(secret: string, entered: string, previous: number) {
  const value = entered.replace(/\s/g, "");
  if (!/^\d{6}$/.test(value)) return null;
  const counter = Math.floor(Date.now() / 30_000);
  let matched: number | null = null;
  for (const step of [counter - 1, counter, counter + 1]) {
    const expected = await createOTP(secret).hotp(step);
    if (timingSafeEqual(Buffer.from(value), Buffer.from(expected)) && step > previous) matched = step;
  }
  return matched;
}
async function unlockSession(db: Tx, userId: string, sessionId: string) {
  const until = new Date(Date.now() + ADMIN_UNLOCK_MS);
  const changed = await db.session.updateMany({ where: { id: sessionId, userId, expiresAt: { gt: new Date() } }, data: { adminVerifiedUntil: until, normalMode: false } });
  if (!changed.count) throw new AppError("UNAUTHENTICATED", "Your sign-in expired. Sign in again.");
  return until.toISOString();
}

export async function executeAdminSecurity(userId: string, input: z.input<typeof adminSecurityCommand>) {
  const command = adminSecurityCommand.parse(input);
  const session = await securitySession(userId);
  await rateLimit(`admin-security:${userId}`, 30, 15 * 60);
  if (command.op === "lock") {
    await prisma.$transaction(async db => {
      await db.session.updateMany({ where: { id: session.id, userId }, data: { adminVerifiedUntil: null } });
      await adminAudit(userId, "admin.authentication.locked", "user", userId, {}, db);
    });
    return { ok: true as const };
  }
  if (command.op === "enroll") {
    requireEnrollmentEmail(session.adminEmailVerifiedAt);
    const secret = randomBytes(32).toString("base64url");
    const encrypted = await symmetricEncrypt({ key: cipherKey(), data: secret });
    await prisma.$transaction(async db => {
      const current = await securitySession(userId, db);
      requireEnrollmentEmail(current.adminEmailVerifiedAt);
      const record = await db.adminAuthenticator.findUnique({ where: { userId } });
      if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) throw new AppError("RATE_LIMITED", "Too many incorrect codes. Try again after the security lock expires.");
      // Replacing a configured factor needs both fresh email proof and a factor
      // verified in the last five minutes. Keep the existing factor until confirmed.
      if (record?.enabledAt && (!current.adminVerifiedUntil || current.normalMode || current.adminVerifiedUntil.getTime() < Date.now() + ADMIN_UNLOCK_MS - 5 * 60_000)) throw new AppError("FORBIDDEN", "Unlock admin access with your authenticator or a recovery code, then try again.");
      const pending = { pendingSecret: encrypted, pendingSessionId: current.id, pendingExpiresAt: new Date(Date.now() + ENROLLMENT_MS) };
      await db.adminAuthenticator.upsert({ where: { userId }, create: { userId, ...pending }, update: pending });
      await adminAudit(userId, "admin.authentication.enrollment_started", "user", userId, {}, db);
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    const uri = createOTP(secret).url("Tripanize.app", user.email);
    return { ok: true as const, uri, setupKey: new URL(uri).searchParams.get("secret")! };
  }

  // Return failures from the transaction so counters/lockouts commit before the
  // public error is thrown. All attempts and recovery consumption are atomic.
  const result = await prisma.$transaction(async db => {
    const current = await securitySession(userId, db);
    const record = await db.adminAuthenticator.findUnique({ where: { userId } });
    if (!record) throw new AppError("FORBIDDEN", "Set up your authenticator first.");
    if (record.lockedUntil && record.lockedUntil.getTime() > Date.now()) return { error: "locked" as const };
    if (command.op === "confirm") {
      requireEnrollmentEmail(current.adminEmailVerifiedAt);
      if (!record.pendingSecret || record.pendingSessionId !== current.id || !record.pendingExpiresAt || record.pendingExpiresAt.getTime() <= Date.now()) throw new AppError("VALIDATION", "This setup has expired. Start authenticator setup again.");
    } else if (!record.enabledAt || !record.encryptedSecret) throw new AppError("FORBIDDEN", "Confirm your authenticator setup first.");
    let counter: number | null = null, recoveryIndex = -1;
    const savedHashes = hashes(record.recoveryHashes);
    const recovery = command.op === "unlock" && command.recovery === true;
    if (recovery) {
      const expected = Buffer.from(recoveryHash(userId, command.code), "hex");
      savedHashes.forEach((value, index) => { if (timingSafeEqual(Buffer.from(value, "hex"), expected)) recoveryIndex = index; });
    } else {
      const encrypted = command.op === "confirm" ? record.pendingSecret! : record.encryptedSecret!;
      const secret = await symmetricDecrypt({ key: cipherKey(), data: encrypted });
      counter = await matchingCounter(secret, command.code, command.op === "confirm" ? -1 : record.lastCounter);
    }
    if (counter === null && recoveryIndex < 0) {
      const failures = (record.lockedUntil ? 0 : record.failedAttempts) + 1;
      const locked = failures >= MAX_FAILURES;
      await db.adminAuthenticator.update({ where: { userId }, data: { failedAttempts: failures, lockedUntil: locked ? new Date(Date.now() + LOCK_MS) : null } });
      await adminAudit(userId, "admin.authentication.failed", "user", userId, { locked }, db);
      return { error: locked ? "locked" as const : "invalid" as const };
    }
    if (command.op === "confirm") {
      const recovery = newRecoveryCodes(userId);
      await db.adminAuthenticator.update({ where: { userId }, data: { encryptedSecret: record.pendingSecret, enabledAt: new Date(), recoveryHashes: recovery.hashes, lastCounter: counter!, failedAttempts: 0, lockedUntil: null, pendingSecret: null, pendingSessionId: null, pendingExpiresAt: null } });
      // A new or replaced authenticator invalidates every other sign-in.
      await db.session.deleteMany({ where: { userId, id: { not: current.id } } });
      const verifiedUntil = await unlockSession(db, userId, current.id);
      await adminAudit(userId, "admin.authentication.enabled", "user", userId, {}, db);
      return { ok: true as const, recoveryCodes: recovery.codes, verifiedUntil };
    }
    const replacement = command.op === "recovery-codes" ? newRecoveryCodes(userId) : null;
    await db.adminAuthenticator.update({ where: { userId }, data: { failedAttempts: 0, lockedUntil: null, ...(counter !== null ? { lastCounter: counter } : {}), ...(replacement ? { recoveryHashes: replacement.hashes } : recoveryIndex >= 0 ? { recoveryHashes: savedHashes.filter((_, index) => index !== recoveryIndex) } : {}) } });
    const verifiedUntil = await unlockSession(db, userId, current.id);
    await adminAudit(userId, replacement ? "admin.authentication.recovery_regenerated" : "admin.authentication.unlocked", "user", userId, { method: recovery ? "recovery" : "authenticator" }, db);
    return { ok: true as const, verifiedUntil, ...(replacement ? { recoveryCodes: replacement.codes } : {}) };
  });
  if ("error" in result) throw new AppError(result.error === "locked" ? "RATE_LIMITED" : "VALIDATION", result.error === "locked" ? "Too many incorrect codes. Admin verification is locked for 15 minutes." : "That code is incorrect, expired or already used. Try the next authenticator code or an unused recovery code.");
  return result;
}

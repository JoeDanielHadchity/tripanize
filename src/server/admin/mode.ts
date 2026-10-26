import { getWorkerSession } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { isCompanyIdentity, isCompanyAccount, companyAccount, hasAdminAuthentication } from "./identity";
import { AppError } from "@/server/errors";
import { currentRuntime, type AccountModeContext } from "@/server/cloudflare/runtime";
import { adminAudit } from "./audit";
import { invalidateAdminEmailChallenge } from "./security";

/** Establish trusted, request-local state before rendering or handling any app API.
 * Never use a client-supplied user ID, mode header or unsigned preference cookie.
 */
export async function resolveAccountMode(headers: Headers): Promise<AccountModeContext | undefined> {
  if (!headers.has("cookie")) return undefined;
  const session = await getWorkerSession(headers);
  if (!session || !isCompanyIdentity(session.user)) return undefined;
  return sessionAccountMode(session.user.id, session.session.id);
}
export async function sessionAccountMode(userId: string, sessionId: string): Promise<AccountModeContext | undefined> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, suspendedAt: true } });
  if (!user || user.suspendedAt || !isCompanyAccount(user)) return undefined;
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId, expiresAt: { gt: new Date() } }, select: { normalMode: true } });
  return session ? { userId, sessionId, normal: session.normalMode } : undefined;
}

/** Eligibility remains independent from active admin powers so the owner can return. */
export async function setAccountMode(userId: string, mode: "ADMIN" | "NORMAL") {
  if (!await companyAccount(userId)) throw new AppError("FORBIDDEN", "This switch is only available to the verified administrator account.");
  if (mode !== "ADMIN" && mode !== "NORMAL") throw new AppError("VALIDATION", "Choose Admin or Normal mode.");
  const context = currentRuntime().accountMode;
  if (!context?.sessionId || context.userId !== userId) throw new AppError("UNAUTHENTICATED", "Sign in again before switching modes.");
  if (mode === "ADMIN" && !await hasAdminAuthentication(userId)) throw new AppError("FORBIDDEN", "Enter a fresh code sent to your email to return to Admin mode.", { adminAuthentication: true });
  return prisma.$transaction(async tx => {
    const changed = await tx.session.updateMany({ where: { id: context.sessionId, userId, expiresAt: { gt: new Date() } }, data: { normalMode: mode === "NORMAL", ...(mode === "NORMAL" ? { adminVerifiedUntil: null, adminEmailUnlockedAt: null } : {}) } });
    if (!changed.count) throw new AppError("UNAUTHENTICATED", "This session has expired. Sign in again.");
    if (mode === "NORMAL") await invalidateAdminEmailChallenge(tx, userId, context.sessionId!);
    // No session IDs, cookies or credentials are included in the activity log.
    await adminAudit(userId, "account.mode", "user", userId, { mode }, tx);
    return { mode };
  });
}

import { OPERATOR_NAME } from "@/lib/legal";
import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentRuntime, normalUserMode } from "@/server/cloudflare/runtime";

// Private server configuration. Profile fields and invitation recipients cannot assign this role.
function companyEmail() { return currentRuntime().companyAdminEmail?.trim().toLowerCase() || null; }
// Personal identity inside shared trips; the public business identity stays OPERATOR_NAME.
export const COMPANY_ACCOUNT_DISPLAY_NAME = "Joe Daniel Hadchity";
export function isCompanyIdentity(user: { email: string }) { const email = companyEmail(); return Boolean(email && user.email.trim().toLowerCase() === email); }
export function isCompanyAccount(user: { email: string; emailVerified: boolean }) { return user.emailVerified && isCompanyIdentity(user); }
export function accountDisplayName(user: { email: string; name: string }) { return isCompanyIdentity(user) ? COMPANY_ACCOUNT_DISPLAY_NAME : user.name; }
export async function companyAccount(userId: string, db: Pick<Tx, "user"> = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, suspendedAt: true } });
  return Boolean(user && !user.suspendedAt && isCompanyAccount(user));
}
export async function hasAdminAuthentication(userId: string, db: Pick<Tx, "session"> = prisma) {
  const context = currentRuntime().accountMode;
  if (!context?.sessionId || context.userId !== userId || context.normal) return false;
  const session = await db.session.findFirst({ where: { id: context.sessionId, userId, normalMode: false, expiresAt: { gt: new Date() }, adminVerifiedUntil: { gt: new Date() }, adminEmailUnlockedAt: { gte: new Date(Date.now() - 30 * 60_000), lte: new Date() } }, select: { id: true } });
  return Boolean(session);
}
export async function requireCompanyAdmin(userId: string, db: Pick<Tx, "user" | "session"> = prisma) {
  if (normalUserMode(userId)) throw new AppError("FORBIDDEN", "Switch back to Admin mode in Account to use administrator features.");
  if (!await companyAccount(userId, db)) throw new AppError("FORBIDDEN", `Only the ${OPERATOR_NAME} administrator account can manage trial invitations.`);
  if (!await hasAdminAuthentication(userId, db)) throw new AppError("FORBIDDEN", "Unlock Admin mode with a code sent to your email in Account → Admin access.", { adminAuthentication: true });
}

/** Run once for an existing configured account on startup. The private email is
 * never embedded in SQL/source; all stored display labels change atomically.
 */
export async function normalizeCompanyIdentity() {
  const email = companyEmail();
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const displayName = accountDisplayName(user);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "TripNotification" SET "summary" = replace("summary",
      (SELECT "actorName" FROM "AuditLog" WHERE "AuditLog"."id" = "TripNotification"."auditId"), ${displayName})
      WHERE "kind" = 'change' AND "auditId" IN (SELECT "id" FROM "AuditLog" WHERE "actorId" = ${user.id}
      AND "actorName" IS NOT NULL AND "actorName" <> '' AND "actorName" <> ${displayName})`;
    // Existing email payloads and delivery states remain immutable; only in-app labels change.
    await tx.auditLog.updateMany({ where: { actorId: user.id, actorName: { not: displayName } }, data: { actorName: displayName } });
    const travelers = await tx.traveler.findMany({ where: { userId: user.id, name: { not: displayName } }, select: { tripId: true } });
    await tx.traveler.updateMany({ where: { userId: user.id, name: { not: displayName } }, data: { name: displayName } });
    const tripIds = [...new Set(travelers.map(t => t.tripId))];
    for (let i = 0; i < tripIds.length; i += 50) await tx.trip.updateMany({ where: { id: { in: tripIds.slice(i, i + 50) } }, data: { revision: { increment: 1 } } });
    const chats = await tx.trip.findMany({ where: { chatMessages: { some: { senderId: user.id, senderName: { not: displayName } } } }, select: { id: true } });
    for (const chat of chats) {
      const trip = await tx.trip.update({ where: { id: chat.id }, data: { chatRevision: { increment: 1 }, revision: { increment: 1 } }, select: { chatRevision: true } });
      await tx.chatMessage.updateMany({ where: { tripId: chat.id, senderId: user.id, senderName: { not: displayName } }, data: { senderName: displayName, revision: trip.chatRevision } });
    }
    if (user.name !== displayName) await tx.user.update({ where: { id: user.id }, data: { name: displayName } });
  }, { timeout: 30000 });
  return user.id;
}

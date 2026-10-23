import { OPERATOR_NAME } from "@/lib/legal";
import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentRuntime, normalUserMode } from "@/server/cloudflare/runtime";

// Private server configuration. Profile fields and invitation recipients cannot assign this role.
function companyEmail() { return currentRuntime().companyAdminEmail?.trim().toLowerCase() || null; }
export function isCompanyIdentity(user: { email: string }) { const email = companyEmail(); return Boolean(email && user.email.trim().toLowerCase() === email); }
export function isCompanyAccount(user: { email: string; emailVerified: boolean }) { return user.emailVerified && isCompanyIdentity(user); }
export function accountDisplayName(user: { email: string; name: string }) { return isCompanyIdentity(user) ? OPERATOR_NAME : user.name; }
export async function companyAccount(userId: string, db: Pick<Tx, "user"> = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true, suspendedAt: true } });
  return Boolean(user && !user.suspendedAt && isCompanyAccount(user));
}
export async function requireCompanyAdmin(userId: string, db: Pick<Tx, "user"> = prisma) {
  if (normalUserMode(userId)) throw new AppError("FORBIDDEN", "Switch back to Admin mode in Account to use administrator features.");
  if (!await companyAccount(userId, db)) throw new AppError("FORBIDDEN", `Only the ${OPERATOR_NAME} administrator account can manage trial invitations.`);
}

/** Run once for an existing configured account on startup. The private email is
 * never embedded in SQL/source; all stored display labels change atomically.
 */
export async function normalizeCompanyIdentity() {
  const email = companyEmail();
  if (!email) return null;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`UPDATE "TripNotification" SET "summary" = replace("summary",
      (SELECT "actorName" FROM "AuditLog" WHERE "AuditLog"."id" = "TripNotification"."auditId"), ${OPERATOR_NAME})
      WHERE "kind" = 'change' AND "auditId" IN (SELECT "id" FROM "AuditLog" WHERE "actorId" = ${user.id}
      AND "actorName" IS NOT NULL AND "actorName" <> '' AND "actorName" <> ${OPERATOR_NAME})`;
    // Keep attempted email payloads immutable and stop old personal labels from being sent.
    await tx.tripNotification.updateMany({ where: { emailStatus: "queued", audit: { actorId: user.id, actorName: { not: OPERATOR_NAME } } }, data: { emailStatus: "cancelled", nextAttemptAt: null } });
    await tx.auditLog.updateMany({ where: { actorId: user.id }, data: { actorName: OPERATOR_NAME } });
    const travelers = await tx.traveler.findMany({ where: { userId: user.id, name: { not: OPERATOR_NAME } }, select: { tripId: true } });
    await tx.traveler.updateMany({ where: { userId: user.id }, data: { name: OPERATOR_NAME } });
    const tripIds = [...new Set(travelers.map(t => t.tripId))];
    for (let i = 0; i < tripIds.length; i += 50) await tx.trip.updateMany({ where: { id: { in: tripIds.slice(i, i + 50) } }, data: { revision: { increment: 1 } } });
    const chats = await tx.trip.findMany({ where: { chatMessages: { some: { senderId: user.id, senderName: { not: OPERATOR_NAME } } } }, select: { id: true } });
    for (const chat of chats) {
      const trip = await tx.trip.update({ where: { id: chat.id }, data: { chatRevision: { increment: 1 }, revision: { increment: 1 } }, select: { chatRevision: true } });
      await tx.chatMessage.updateMany({ where: { tripId: chat.id, senderId: user.id }, data: { senderName: OPERATOR_NAME, revision: trip.chatRevision } });
    }
    await tx.user.update({ where: { id: user.id }, data: { name: OPERATOR_NAME } });
  }, { timeout: 30000 });
  return user.id;
}

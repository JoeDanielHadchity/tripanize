import { prisma, type Tx } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";

// Private server configuration. Profile fields and invitation recipients cannot assign this role.
function companyEmail() { return currentRuntime().companyAdminEmail?.trim().toLowerCase() || null; }
export function isCompanyIdentity(user: { email: string }) { const email = companyEmail(); return Boolean(email && user.email.trim().toLowerCase() === email); }
export function isCompanyAccount(user: { email: string; emailVerified: boolean }) { return user.emailVerified && isCompanyIdentity(user); }
export function accountDisplayName(user: { email: string; name: string }) { return isCompanyIdentity(user) ? "The company" : user.name; }
export async function companyAccount(userId: string, db: Pick<Tx, "user"> = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } });
  return Boolean(user && isCompanyAccount(user));
}
export async function requireCompanyAdmin(userId: string, db: Pick<Tx, "user"> = prisma) {
  if (!await companyAccount(userId, db)) throw new AppError("FORBIDDEN", "Only the company account can manage trial invitations.");
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
      (SELECT "actorName" FROM "AuditLog" WHERE "AuditLog"."id" = "TripNotification"."auditId"), 'The company')
      WHERE "kind" = 'change' AND "auditId" IN (SELECT "id" FROM "AuditLog" WHERE "actorId" = ${user.id}
      AND "actorName" IS NOT NULL AND "actorName" <> '' AND "actorName" <> 'The company')`;
    // Keep attempted email payloads immutable and stop old personal labels from being sent.
    await tx.tripNotification.updateMany({ where: { emailStatus: "queued", audit: { actorId: user.id, actorName: { not: "The company" } } }, data: { emailStatus: "cancelled", nextAttemptAt: null } });
    await tx.auditLog.updateMany({ where: { actorId: user.id }, data: { actorName: "The company" } });
    const travelers = await tx.traveler.findMany({ where: { userId: user.id, name: { not: "The company" } }, select: { tripId: true } });
    await tx.traveler.updateMany({ where: { userId: user.id }, data: { name: "The company" } });
    const tripIds = [...new Set(travelers.map(t => t.tripId))];
    for (let i = 0; i < tripIds.length; i += 50) await tx.trip.updateMany({ where: { id: { in: tripIds.slice(i, i + 50) } }, data: { revision: { increment: 1 } } });
    const chats = await tx.trip.findMany({ where: { chatMessages: { some: { senderId: user.id, senderName: { not: "The company" } } } }, select: { id: true } });
    for (const chat of chats) {
      const trip = await tx.trip.update({ where: { id: chat.id }, data: { chatRevision: { increment: 1 }, revision: { increment: 1 } }, select: { chatRevision: true } });
      await tx.chatMessage.updateMany({ where: { tripId: chat.id, senderId: user.id }, data: { senderName: "The company", revision: trip.chatRevision } });
    }
    await tx.user.update({ where: { id: user.id }, data: { name: "The company" } });
  }, { timeout: 30000 });
  return user.id;
}

import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { isCompanyIdentity } from "@/server/admin/identity";
import { removeMember } from "@/server/invitations/service";

/** Account deletion requires a fresh server-verified session and explicit typed
 * confirmation. Shared financial/trip history remains, with identity removed. */
export async function deleteMobileAccount(userId: string, sessionId: string | undefined, email: string, confirmation: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (isCompanyIdentity(user)) throw new AppError("FORBIDDEN", "The platform administrator account cannot be deleted from the mobile app.");
  if (confirmation !== "DELETE" || email.trim().toLowerCase() !== user.email.toLowerCase()) throw new AppError("VALIDATION", "Enter your email and DELETE to confirm.");
  const session = sessionId ? await prisma.session.findFirst({ where: { id: sessionId, userId, expiresAt: { gt: new Date() }, createdAt: { gt: new Date(Date.now() - 10 * 60000) } } }) : null;
  if (!session || !user.emailVerified) throw new AppError("FORBIDDEN", "Sign out and sign in with an email code, then delete your account within 10 minutes.");
  if (await prisma.trip.count({ where: { ownerId: userId } })) throw new AppError("CONFLICT", "Transfer or delete every trip you organize before deleting your account.");
  for (const membership of await prisma.tripMembership.findMany({ where: { userId } })) await removeMember(userId, membership.tripId, userId);
  await prisma.$transaction(async tx => {
    // Recheck within the transaction, including an organizer transfer racing deletion.
    if (await tx.trip.count({ where: { ownerId: userId } })) throw new AppError("CONFLICT", "You now organize a trip. Transfer or delete it before continuing.");
    await tx.traveler.updateMany({ where: { userId }, data: { name: "Former traveler", leftAt: new Date(), userId: null } });
    await tx.chatMessage.updateMany({ where: { senderId: userId }, data: { senderName: "Former traveler" } });
    await tx.auditLog.updateMany({ where: { actorId: userId }, data: { actorName: "Former traveler", actorId: null } });
    await tx.aiUsage.updateMany({ where: { userId }, data: { userId: null } });
    await tx.user.delete({ where: { id: userId } });
  });
}

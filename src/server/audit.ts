import type { Tx } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { queueChangeNotifications } from "@/server/notifications/changes";
import { accountDisplayName } from "@/server/admin/identity";

/** Records an audit entry and bumps the trip revision so other members' devices refresh. */
export async function recordChange(
  tx: Tx,
  args: { tripId: string; actorId: string | null; entity: string; entityId: string; action: string; before?: unknown; after?: unknown },
) {
  const actor = args.actorId ? await tx.user.findUnique({ where: { id: args.actorId }, select: { name: true, email: true } }) : null;
  const change = await tx.auditLog.create({
    data: {
      tripId: args.tripId,
      actorId: args.actorId,
      actorName: actor ? accountDisplayName(actor) : null,
      entity: args.entity,
      entityId: args.entityId,
      action: args.action,
      before: (args.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (args.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
  await tx.trip.update({ where: { id: args.tripId }, data: { revision: { increment: 1 }, lastChangedById: args.actorId } });
  await queueChangeNotifications(tx, change);
}

import { prisma, type Tx } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
export async function adminAudit(actorId: string, action: string, targetType: string, targetId: string, details: Prisma.InputJsonValue = {}, db: Pick<Tx, "adminAudit"> = prisma) {
  await db.adminAudit.create({ data: { actorId, action, targetType, targetId, details } });
}

import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { noStore, withUser } from "@/server/api";

export async function GET(_req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async (userId) => {
    await requireTrip(tripId, userId, "view");
    const t = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { revision: true, lastChangedById: true } });
    const changedBy = t.lastChangedById ? await prisma.user.findUnique({ where: { id: t.lastChangedById }, select: { id: true, name: true } }) : null;
    return NextResponse.json({ revision: t.revision, changedBy }, { headers: noStore });
  });
}

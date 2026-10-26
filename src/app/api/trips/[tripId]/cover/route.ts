import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { getTripCover } from "@/server/images";

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return withUser(async userId => NextResponse.json(await getTripCover(userId, tripId), { headers: noStore }));
}

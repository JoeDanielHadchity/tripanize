import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { getDestinationSearch } from "@/server/destinations/service";
export async function GET(_request: Request, { params }: { params: Promise<{ searchId: string }> }) {
  const { searchId } = await params;
  return withUser(async userId => NextResponse.json(await getDestinationSearch(userId, searchId), { headers: noStore }));
}

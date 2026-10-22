import { NextResponse } from "next/server";
import { noStore, withUser } from "@/server/api";
import { listChangeNotifications } from "@/server/notifications/changes";

export async function GET(request: Request) {
  return withUser(async userId => NextResponse.json(
    await listChangeNotifications(userId, new URL(request.url).searchParams.get("cursor") ?? undefined),
    { headers: noStore },
  ));
}

import { NextResponse } from "next/server";
import { withUser, noStore } from "@/server/api";
import { changeMemberLocation, getLocationSelf, getMemberLocations } from "@/server/locations/service";

const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: noStore });

export async function GET(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const result = await withUser(async userId => json(new URL(req.url).searchParams.has("self") ? await getLocationSelf(userId, tripId) : await getMemberLocations(userId, tripId)));
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  return result;
}

export async function POST(req: Request, { params }: { params: Promise<{ tripId: string }> }) {
  if (req.headers.get("Origin") !== new URL(req.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  if (!req.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "JSON is required." }, 415);
  const { tripId } = await params;
  const result = await withUser(async userId => {
    const text = await req.text();
    if (text.length > 2048) return json({ error: "Request is too large." }, 413);
    let input: unknown;
    try { input = JSON.parse(text); } catch { return json({ error: "Invalid JSON." }, 400); }
    return json(await changeMemberLocation(userId, tripId, input));
  });
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  return result;
}

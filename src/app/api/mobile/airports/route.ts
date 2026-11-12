import { searchAirports } from "@/server/airports/search";

/** Public airport search for the trip form (website and app). ?q=lisbon */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 60);
  return Response.json({ airports: searchAirports(q) }, { headers: { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}

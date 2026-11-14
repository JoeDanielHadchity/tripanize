import { searchCities } from "@/server/places/cities";

/** Public city search for "Where are you going?" (website and app). ?q=beirut */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").slice(0, 60);
  try {
    return Response.json({ cities: await searchCities(q) }, { headers: { "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch {
    // Suggestions are a convenience: an empty list keeps the free-text box working.
    return Response.json({ cities: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

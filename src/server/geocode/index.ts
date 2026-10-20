import { cached, fetchJson } from "@/server/http";

// City-level geocoding via the Open-Meteo geocoding API (no key required).
export type GeoResult = { name: string; country: string | null; lat: number; lng: number; timezone: string | null };

type OMGeo = { results?: { name: string; country?: string; latitude: number; longitude: number; timezone?: string }[] };

export async function geocodeCity(query: string): Promise<GeoResult | null> {
  const q = query.split(",")[0].trim();
  if (!q) return null;
  const { value } = await cached(`geo:${q.toLowerCase()}`, 60 * 60 * 24 * 90, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
    const data = await fetchJson<OMGeo>("Geocoding", url);
    const r = data.results?.[0];
    return r ? { name: r.name, country: r.country ?? null, lat: r.latitude, lng: r.longitude, timezone: r.timezone ?? null } : null;
  });
  return value;
}

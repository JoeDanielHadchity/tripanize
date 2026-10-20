import { cached, fetchJson } from "@/server/http";

/**
 * Routing module.
 * With ORS_API_KEY set, travel times come from openrouteservice (labeled "route").
 * Otherwise we return straight-line based estimates (labeled "estimate") — never presented as live optimization.
 */
export type Mode = "walking" | "driving" | "transit" | "cycling";
export type TravelEstimate = { minutes: number; km: number; basis: "route" | "estimate"; provider: string };

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const SPEED_KMH: Record<Mode, number> = { walking: 4.5, cycling: 14, transit: 22, driving: 45 };
const DETOUR: Record<Mode, number> = { walking: 1.3, cycling: 1.3, transit: 1.4, driving: 1.3 };

export function estimateTravel(a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: Mode): TravelEstimate {
  const km = haversineKm(a, b) * DETOUR[mode];
  // Long drives average higher speeds on highways.
  const speed = mode === "driving" && km > 40 ? 75 : SPEED_KMH[mode];
  const overhead = mode === "transit" ? 8 : mode === "driving" ? 5 : 0;
  return { minutes: Math.max(1, Math.round((km / speed) * 60 + overhead)), km: Math.round(km * 10) / 10, basis: "estimate", provider: "Straight-line estimate" };
}

export function routingConfigured() {
  return Boolean(process.env.ORS_API_KEY);
}

const ORS_PROFILE: Partial<Record<Mode, string>> = { driving: "driving-car", walking: "foot-walking", cycling: "cycling-regular" };

export async function travelTime(a: { lat: number; lng: number }, b: { lat: number; lng: number }, mode: Mode): Promise<TravelEstimate> {
  const profile = ORS_PROFILE[mode];
  if (!process.env.ORS_API_KEY || !profile) return estimateTravel(a, b, mode);
  try {
    const key = `route:${profile}:${a.lat.toFixed(4)},${a.lng.toFixed(4)}:${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
    const { value } = await cached(key, 60 * 60 * 24 * 7, async () => {
      const data = await fetchJson<{ routes?: { summary: { distance: number; duration: number } }[] }>("openrouteservice", `https://api.openrouteservice.org/v2/directions/${profile}`, {
        method: "POST",
        headers: { Authorization: process.env.ORS_API_KEY!, "Content-Type": "application/json" },
        body: JSON.stringify({ coordinates: [[a.lng, a.lat], [b.lng, b.lat]] }),
      });
      const s = data.routes?.[0]?.summary;
      if (!s) throw new Error("no route");
      return { minutes: Math.round(s.duration / 60), km: Math.round(s.distance / 100) / 10 };
    });
    return { ...value, basis: "route", provider: "openrouteservice" };
  } catch {
    return estimateTravel(a, b, mode);
  }
}

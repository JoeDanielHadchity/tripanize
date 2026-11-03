import type { GoogleMapsConfig } from "@/lib/google-maps";

/**
 * Google Maps for the website's maps. GOOGLE_MAPS_BROWSER_KEY is a browser key, so
 * it is visible to visitors by design: restrict it to the site's domains and to the
 * Maps JavaScript API in Google Cloud. GOOGLE_MAPS_MAP_ID is optional (custom style
 * and modern markers). Without a key, maps keep using OpenStreetMap.
 */
export function googleMapsConfig(): GoogleMapsConfig | null {
  const key = process.env.GOOGLE_MAPS_BROWSER_KEY?.trim();
  if (!key || !/^[\w-]{20,60}$/.test(key)) return null;
  const mapId = process.env.GOOGLE_MAPS_MAP_ID?.trim();
  return { key, mapId: mapId && /^[\w-]{1,60}$/.test(mapId) ? mapId : null };
}

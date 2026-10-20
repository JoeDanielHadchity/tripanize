export type MapsApp = "GOOGLE" | "APPLE" | "OSM";

type Place = { title?: string | null; address?: string | null; lat?: number | null; lng?: number | null; locationName?: string | null };

function query(p: Place) {
  return [p.locationName ?? p.title, p.address].filter(Boolean).join(", ");
}

export function directionsUrl(p: Place, app: MapsApp = "GOOGLE", mode: "walking" | "driving" | "transit" = "transit") {
  const hasCoords = typeof p.lat === "number" && typeof p.lng === "number";
  const q = query(p);
  if (!hasCoords && !q) return null;
  if (app === "APPLE") {
    const flag = mode === "driving" ? "d" : mode === "walking" ? "w" : "r";
    return hasCoords
      ? `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=${flag}`
      : `https://maps.apple.com/?daddr=${encodeURIComponent(q)}&dirflg=${flag}`;
  }
  if (app === "OSM") {
    return hasCoords
      ? `https://www.openstreetmap.org/directions?to=${p.lat}%2C${p.lng}`
      : `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
  }
  const dest = hasCoords && !q ? `${p.lat},${p.lng}` : q;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`;
}

/** Only allow http(s) links from AI or external content to be rendered as anchors. */
export function safeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

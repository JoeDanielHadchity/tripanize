/** Public editorial data only. Never extend this with user or trip records. */
export const PUBLIC_GUIDE_SLUGS = ["bangkok", "hong-kong", "london", "paris", "istanbul", "lisbon-porto"] as const;
export type PublicGuideSlug = typeof PUBLIC_GUIDE_SLUGS[number];
export type MobileGuideCard = { slug: string; city: string; country: string; image: string; alt: string; dayCount: number };
export type MobilePublicHome = { guides: MobileGuideCard[] };
export type MobilePublicGuide = {
  slug: string; title: string; intro: string; image: string; alt: string;
  days: { title: string; area: string; note: string; food?: string; planB?: string; stops: { time: string; title: string; detail: string; duration: string; url?: string }[] }[];
  budget?: { currency: string; range: string; note: string; rows: string[][] };
  tips: { title: string; text: string }[];
  bookings: { label: string; note: string; url?: string }[];
  sources: { label: string; url: string }[];
};

/** Only known local destinations can survive sign-in. */
export function publicLoginDestination(next: unknown): string {
  if (next === "start") return "/start";
  if (next === "trips") return "/trips";
  if (next === "account") return "/account";
  if (typeof next === "string" && next.startsWith("guide:")) {
    const slug = next.slice(6);
    if (PUBLIC_GUIDE_SLUGS.some(allowed => allowed === slug)) return `/guide/${slug}`;
  }
  return "/";
}

/** Layout context only. Public pages with a tripId query remain public layouts. */
export function isMobileTripRoute(pathname: string, tripId?: unknown): boolean {
  const id = Array.isArray(tripId) ? tripId[0] : tripId;
  return /^\/trip\/[^/]+\/?$/.test(pathname) || pathname === "/workspace" && typeof id === "string" && id.trim().length > 0;
}

/** Navigation state only; it never grants access to a private screen. */
export function mobileNavigationSection(pathname: string, screen?: string): "home" | "trips" | "account" {
  if (pathname === "/account" || (pathname === "/workspace" && (screen === "account" || screen === "notifications" || screen === "admin" || screen?.startsWith("admin-")))) return "account";
  if (pathname === "/trips" || pathname.startsWith("/trip/") || pathname === "/workspace") return "trips";
  return "home";
}

export function publicHttpsLink(value?: string): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

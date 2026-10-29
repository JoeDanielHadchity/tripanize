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

/** Only a trip start or one of our public examples can be a login destination. */
export function publicLoginDestination(next: unknown): string {
  if (next === "start") return "/start";
  if (typeof next === "string" && next.startsWith("guide:")) {
    const slug = next.slice(6);
    if (PUBLIC_GUIDE_SLUGS.some(allowed => allowed === slug)) return `/guide/${slug}`;
  }
  return "/";
}

export function publicHttpsLink(value?: string): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

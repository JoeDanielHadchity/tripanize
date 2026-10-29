import type { Metadata } from "next";

export const SITE_ORIGIN = "https://www.tripanize.app";
export const SITE_DESCRIPTION = "Plan trips together with AI itineraries, linked bookings, packing lists and shared expenses. Start free; Premium is $15 per trip for every traveler.";

export const PUBLIC_PAGES = {
  "/": { title: "Trip Planner & Group Travel Organizer", description: SITE_DESCRIPTION },
  "/plans": { title: "Free Trip Planning & Premium — $15 per Trip", description: "Compare Tripanize Standard and Premium. Start with 2 AI-planned days for free, or unlock full AI planning and group tools for $15 per trip, all travelers included." },
  "/examples": { title: "Trip Ideas & Example Travel Itineraries", description: "Explore Bangkok, Hong Kong, London, Paris, Istanbul and Lisbon–Porto itineraries. Browse routes, planning budgets and booking links, then save your own trip." },
  "/ai-trip-planner": { title: "Trip Planner — Build Your Travel Itinerary", description: "Create an editable itinerary around your dates, interests and travel pace. Start with 2 AI-planned days free; Premium is $15 per trip for your whole group." },
  "/group-trip-planner": { title: "Group Travel — Plan a Trip with Friends", description: "Plan a group trip with shared itineraries, bookings and editor or viewer roles. Start free. Premium adds chat and expenses for $15 per trip, for everyone." },
  "/travel-expense-splitter": { title: "Expense splitter — Split Costs & Settle Up", description: "Track group travel expenses, attach receipts and see who owes whom. Keep actual spending separate from estimates. Included in Premium: $15 per trip." },
  "/contact": { title: "Contact & Support", description: "Contact Tripanize.app for help with trip planning, your account, Premium access, payments or privacy questions." },
  "/terms": { title: "Terms of Service", description: "Read the terms for using Tripanize.app, including accounts, shared trips, AI suggestions and Premium access." },
  "/privacy": { title: "Privacy Policy", description: "Learn how Tripanize.app handles accounts, shared trip information, receipts, optional location sharing and AI planning requests." },
  "/refunds": { title: "Refund Policy", description: "Find out how to request help with a Tripanize Premium purchase, a payment issue or a refund." },
} as const;

export function publicMetadata(path: string, details: { title: string; description: string }): Metadata {
  const url = SITE_ORIGIN + path;
  const title = `${details.title} | Tripanize`;
  const image = { url: `${SITE_ORIGIN}/brand/tripanize-icon-512.png`, width: 512, height: 512, alt: "Tripanize folded map and suitcase logo" };
  return {
    title: { absolute: title },
    description: details.description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: "Tripanize", locale: "en_US", url, title, description: details.description, images: [image] },
    twitter: { card: "summary", title, description: details.description, images: [image.url] },
  };
}

/** Only anonymous, public GET/HEAD pages move hosts. Existing sessions and all
 * app routes, APIs, payment callbacks and server actions keep their current host. */
export function publicCanonicalRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.hostname !== "tripanize.app") return null;
  const publicPath = Object.hasOwn(PUBLIC_PAGES, url.pathname) || /^\/examples\/[a-z0-9-]+\/?$/.test(url.pathname);
  if (!publicPath) return null;
  if (/(?:^|;\s*)(?:__Secure-|__Host-)?better-auth\./.test(request.headers.get("Cookie") ?? "")) return null;
  url.hostname = "www.tripanize.app";
  url.protocol = "https:";
  return new Response(null, { status: 308, headers: { Location: url.href, "Cache-Control": "private, no-store", Vary: "Cookie" } });
}

export const SITE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_ORIGIN}/#organization`, name: "Tripanize.app", url: `${SITE_ORIGIN}/`, logo: `${SITE_ORIGIN}/brand/tripanize-icon-512.png`, contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: `${SITE_ORIGIN}/contact` } },
    { "@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`, name: "Tripanize", url: `${SITE_ORIGIN}/`, inLanguage: "en", publisher: { "@id": `${SITE_ORIGIN}/#organization` } },
    { "@type": "WebApplication", "@id": `${SITE_ORIGIN}/#application`, name: "Tripanize", url: `${SITE_ORIGIN}/`, description: SITE_DESCRIPTION, applicationCategory: "TravelApplication", operatingSystem: "Web", browserRequirements: "Requires a modern web browser", publisher: { "@id": `${SITE_ORIGIN}/#organization` }, offers: [
      { "@type": "Offer", name: "Standard", price: "0", priceCurrency: "USD", url: `${SITE_ORIGIN}/plans`, description: "2 AI-planned days per trip, with manual itinerary editing, bookings and packing." },
      { "@type": "Offer", name: "Premium", price: "15", priceCurrency: "USD", url: `${SITE_ORIGIN}/plans`, description: "One-time payment per trip, for all travelers. Applicable taxes are shown before payment." },
    ] },
  ],
};

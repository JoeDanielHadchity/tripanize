import { CITY_GUIDES, GUIDE_BUDGET_BASIS, GUIDE_PHOTOS, guideCardImage, guideImage } from "@/server/examples/city-guides";
import { EXAMPLES } from "@/server/examples/data";
import { PUBLIC_GUIDE_SLUGS, type MobilePublicGuide, type MobilePublicHome } from "@/lib/mobile-public";

/** Reads static, already-published editorial content. No database or session. */
export function publicMobileHome(): MobilePublicHome {
  return { guides: CITY_GUIDES.map(g => ({ slug: g.slug, city: g.city, country: g.country, image: guideCardImage(g.slug), alt: GUIDE_PHOTOS[`${g.slug}-card`].description, dayCount: g.days.length })) };
}

export function publicMobileGuide(slug: string): MobilePublicGuide | null {
  if (!PUBLIC_GUIDE_SLUGS.some(s => s === slug)) return null;
  const guide = CITY_GUIDES.find(g => g.slug === slug);
  if (guide) return {
    slug: guide.slug, title: guide.title, intro: guide.intro, image: guideImage(slug), alt: GUIDE_PHOTOS[slug].description,
    days: guide.days.map(day => ({ title: day.title, area: day.area, note: day.note, food: day.food, planB: day.planB, stops: day.stops.map(s => ({ time: s.time, title: s.title, detail: s.detail, duration: s.duration, ...(s.url ? { url: s.url } : {}) })) })),
    budget: { currency: guide.currency, range: guide.budgetRange, note: [GUIDE_BUDGET_BASIS, guide.currencyNote].filter(Boolean).join(" "), rows: guide.budget },
    tips: [{ title: "Where to stay", text: guide.base }, { title: "Getting around", text: guide.transport }, { title: "Packing", text: guide.packing }],
    bookings: guide.bookings.map(b => ({ label: b.label, note: b.note, url: b.url })), sources: guide.sources.map(s => ({ label: s.label, url: s.url })),
  };
  const ex = EXAMPLES.find(g => g.slug === slug);
  if (!ex) return null;
  return {
    slug: ex.slug, title: ex.name, intro: ex.summary, image: "/editorial/guide.webp", alt: "Lisbon and Porto example trip",
    days: ex.days.map(d => ({ title: d.title, area: d.area, note: d.notes ?? "", planB: d.stops.filter(s => s.plan === "B").map(s => s.title).join(", "), stops: d.stops.filter(s => !s.plan).map(s => ({ time: s.startTime, title: s.title, detail: s.reason, duration: s.durationMin ? `${s.durationMin} min` : "", ...(s.officialUrl ? { url: s.officialUrl } : {}) })) })),
    tips: [], bookings: ex.bookings.map(b => ({ label: b.title, note: b.whenToBook, ...(b.url ? { url: b.url } : {}) })), sources: [],
  };
}

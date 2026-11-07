import { GUIDE_BUDGET_BASIS, GUIDE_PHOTOS, guideImage } from "@/server/examples/city-guides";
import { EXAMPLES } from "@/server/examples/data";
import { findPublishedIdea, publishedTripIdeas } from "@/server/examples/trip-ideas";
import type { MobilePublicGuide, MobilePublicHome } from "@/lib/mobile-public";

/** Published editorial content only (trip ideas as managed on the Company page). No session. */
export async function publicMobileHome(): Promise<MobilePublicHome> {
  const ideas = await publishedTripIdeas();
  return { guides: ideas.map(i => ({ slug: i.slug, city: i.guide.city, country: i.guide.country, image: i.photo.card, alt: i.photo.description, dayCount: i.guide.days.length })) };
}

export async function publicMobileGuide(slug: string): Promise<MobilePublicGuide | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const idea = await findPublishedIdea(slug);
  if (idea) {
    const guide = idea.guide;
    return {
      slug: guide.slug, title: guide.title, intro: guide.intro, image: idea.photo.hero, alt: idea.photo.description,
      days: guide.days.map(day => ({ title: day.title, area: day.area, note: day.note, food: day.food, planB: day.planB, stops: day.stops.map(s => ({ time: s.time, title: s.title, detail: s.detail, duration: s.duration, ...(s.url ? { url: s.url } : {}) })) })),
      budget: { currency: guide.currency, range: guide.budgetRange, note: [GUIDE_BUDGET_BASIS, guide.currencyNote].filter(Boolean).join(" "), rows: guide.budget },
      tips: [{ title: "Where to stay", text: guide.base }, { title: "Getting around", text: guide.transport }, { title: "Packing", text: guide.packing }],
      bookings: guide.bookings.map(b => ({ label: b.label, note: b.note, url: b.url })), sources: guide.sources.map(s => ({ label: s.label, url: s.url })),
    };
  }
  const ex = slug === "lisbon-porto" ? EXAMPLES.find(g => g.slug === slug) : undefined;
  if (!ex) return null;
  return {
    slug: ex.slug, title: ex.name, intro: ex.summary, image: guideImage("lisbon-porto"), alt: GUIDE_PHOTOS["lisbon-porto"].description,
    days: ex.days.map(d => ({ title: d.title, area: d.area, note: d.notes ?? "", planB: d.stops.filter(s => s.plan === "B").map(s => s.title).join(", "), stops: d.stops.filter(s => !s.plan).map(s => ({ time: s.startTime, title: s.title, detail: s.reason, duration: s.durationMin ? `${s.durationMin} min` : "", ...(s.officialUrl ? { url: s.officialUrl } : {}) })) })),
    tips: [], bookings: ex.bookings.map(b => ({ label: b.title, note: b.whenToBook, ...(b.url ? { url: b.url } : {}) })), sources: [],
  };
}

import { z } from "zod";
import { prisma } from "@/server/db";
import { CITY_GUIDES, GUIDE_PHOTOS, guideCardImage, guideCardPreview, guideImage, type CityGuide } from "./city-guides";

/** Where a guide's photos come from: the shipped editorial files, or an upload. */
export type GuidePhoto = { hero: string; card: string; preview: string; description: string; width: number; height: number; pageUrl?: string; license?: string; licenseUrl?: string; credit?: string };
export type TripIdeaStatus = "DRAFTING" | "DRAFT" | "PUBLISHED" | "HIDDEN" | "FAILED";
export type TripIdea = { id: string | null; slug: string; city: string; country: string; builtin: boolean; status: TripIdeaStatus; position: number; guide: CityGuide | null; photo: GuidePhoto | null; error: string | null; edited: boolean; updatedAt: Date | null };

const stop = z.object({ time: z.string().max(10), title: z.string().min(1).max(120), detail: z.string().max(600), duration: z.string().max(40), kind: z.string().max(40), url: z.string().url().max(500).optional() });
const day = z.object({ title: z.string().min(1).max(120), area: z.string().max(160), pace: z.string().max(160), note: z.string().max(600), stops: z.array(stop).min(1).max(10), food: z.string().max(400), planB: z.string().max(400) });
/** The full guide, as stored and as edited on the Company page. */
export const cityGuideSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60), city: z.string().min(1).max(80), country: z.string().min(1).max(80), timezone: z.string().max(60),
  title: z.string().min(1).max(120), subtitle: z.string().max(200), intro: z.string().max(1200),
  currency: z.string().regex(/^[A-Z]{3}$/), currencyNote: z.string().max(400).optional(), budgetRange: z.string().max(80), budget: z.array(z.array(z.string().max(80)).length(2)).max(10),
  base: z.string().max(800), transport: z.string().max(800), packing: z.string().max(800),
  days: z.array(day).min(1).max(7),
  bookings: z.array(z.object({ label: z.string().max(120), note: z.string().max(300), url: z.string().url().max(500) })).max(12),
  sources: z.array(z.object({ label: z.string().max(120), url: z.string().url().max(500) })).max(15),
});

/** Uploaded photos live in file storage under this prefix and are served publicly. */
export const IDEA_PHOTO_PREFIX = "public/trip-ideas/";
export const ideaPhotoUrl = (key: string) => `/api/trip-ideas/photo/${encodeURIComponent(key.slice(IDEA_PHOTO_PREFIX.length))}`;

function builtinPhoto(slug: string): GuidePhoto {
  const hero = GUIDE_PHOTOS[slug], card = GUIDE_PHOTOS[`${slug}-card`] ?? hero;
  return { hero: guideImage(slug), card: guideCardImage(slug), preview: guideCardPreview(slug), description: card?.description ?? hero?.description ?? slug, width: hero?.width ?? 2400, height: hero?.height ?? 1500, pageUrl: hero?.pageUrl, license: hero?.license, licenseUrl: hero?.licenseUrl };
}
function uploadedPhoto(row: { heroImageKey: string | null; cardImageKey: string | null; photoCredit: string | null; city: string }, fallback: GuidePhoto | null): GuidePhoto | null {
  if (!row.heroImageKey && !row.cardImageKey) return fallback;
  const hero = row.heroImageKey ? ideaPhotoUrl(row.heroImageKey) : fallback?.hero ?? ideaPhotoUrl(row.cardImageKey!);
  const card = row.cardImageKey ? ideaPhotoUrl(row.cardImageKey) : hero;
  return { hero, card, preview: card, description: `${row.city}`, width: 2000, height: 1250, credit: row.photoCredit ?? undefined };
}
const parseGuide = (value: unknown): CityGuide | null => { const r = cityGuideSchema.safeParse(value); return r.success ? r.data as CityGuide : null; };

/** Every trip idea, in display order. Built-in guides come first unless reordered. */
export async function listTripIdeas({ all = false }: { all?: boolean } = {}): Promise<TripIdea[]> {
  const rows = await prisma.tripIdea.findMany();
  const ideas: TripIdea[] = CITY_GUIDES.map((g, i) => {
    const row = rows.find(r => r.slug === g.slug);
    const guide = (row?.content ? parseGuide(row.content) : null) ?? g;
    return { id: row?.id ?? null, slug: g.slug, city: guide.city, country: guide.country, builtin: true, status: (row?.status as TripIdeaStatus) ?? "PUBLISHED", position: row?.position ?? i * 10, guide, photo: row ? uploadedPhoto(row, builtinPhoto(g.slug)) : builtinPhoto(g.slug), error: row?.error ?? null, edited: Boolean(row), updatedAt: row?.updatedAt ?? null };
  });
  for (const row of rows) {
    if (CITY_GUIDES.some(g => g.slug === row.slug)) continue;
    ideas.push({ id: row.id, slug: row.slug, city: row.city, country: row.country, builtin: false, status: row.status as TripIdeaStatus, position: row.position, guide: row.content ? parseGuide(row.content) : null, photo: uploadedPhoto(row, null), error: row.error, edited: true, updatedAt: row.updatedAt });
  }
  const visible = all ? ideas : ideas.filter(i => i.status === "PUBLISHED" && i.guide && i.photo);
  return visible.sort((a, b) => a.position - b.position || a.city.localeCompare(b.city));
}

export type PublishedIdea = TripIdea & { guide: CityGuide; photo: GuidePhoto };
/** What the website and app show: published guides with a photo. */
export async function publishedTripIdeas(): Promise<PublishedIdea[]> {
  return await listTripIdeas() as PublishedIdea[];
}
export async function findPublishedIdea(slug: string): Promise<PublishedIdea | null> {
  return (await publishedTripIdeas()).find(i => i.slug === slug) ?? null;
}

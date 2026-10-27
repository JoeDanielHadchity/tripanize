import content from "./city-guides.json";
import photos from "../../../public/editorial/city-guides/credits.json";

export type GuideStop = { time: string; title: string; detail: string; duration: string; kind: string; url?: string };
export type GuideDay = { title: string; area: string; pace: string; note: string; stops: GuideStop[]; food: string; planB: string };
export type CityGuide = {
  slug: string; city: string; country: string; timezone: string; title: string; subtitle: string; intro: string;
  currency: string; currencyNote?: string; budgetRange: string; budget: string[][];
  base: string; transport: string; packing: string; days: GuideDay[];
  bookings: { label: string; note: string; url: string }[];
  sources: { label: string; url: string }[];
};
export const CITY_GUIDES: CityGuide[] = content.guides;
export const GUIDE_BUDGET_BASIS = content.budgetBasis;
export const GUIDE_SCHEDULE_BASIS = content.scheduleBasis;
export const GUIDE_REVIEWED_ON = content.preparedOn;
export const GUIDE_PHOTOS: Record<string, { pageUrl: string; license: string; licenseUrl: string; description: string; width: number; height: number }> = photos;
export const guideImage = (slug: string) => `/editorial/city-guides/${slug}.webp`;
export const guideCardImage = (slug: string) => `/editorial/city-guides/${slug}-card.webp?v=full-frame-20261027`;

/** Display times are suggestions, not provider opening hours or reservations. */
export function guideDuration(label: string): number | undefined {
  const clean = label.replace(/(\d)½/g, "$1.5");
  const number = clean.match(/\d+(?:\.\d+)?/);
  if (!number) return undefined;
  return Math.round(Number(number[0]) * (/hr/.test(clean) ? 60 : 1));
}

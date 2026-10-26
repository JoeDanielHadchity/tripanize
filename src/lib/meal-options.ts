import { z } from "zod";
import { safeUrl } from "./maps";

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = typeof MEALS[number];
export const RestaurantOptionSchema = z.object({
  name: z.string(), cuisine: z.string(), area: z.string(), address: z.string().nullable(),
  whyFits: z.string(), pricePerPerson: z.number().nullable(),
  officialUrl: z.string().nullable(), sourceUrls: z.array(z.string()), hoursNote: z.string().nullable(),
});
export const DayMealsSchema = z.object({
  breakfast: z.array(RestaurantOptionSchema), lunch: z.array(RestaurantOptionSchema), dinner: z.array(RestaurantOptionSchema),
});
export type RestaurantOption = z.infer<typeof RestaurantOptionSchema>;
export type DayMeals = z.infer<typeof DayMealsSchema>;

/** Old itineraries have no meal data. Keep at most two distinct, sourced choices per meal. */
export function readMealOptions(raw: unknown, observedSources?: Iterable<string>): DayMeals {
  const canonical = (value: string) => { const url = new URL(value); url.hash = ""; return url.href.replace(/\/$/, ""); };
  const observed = observedSources ? new Set([...observedSources].map(safeUrl).filter((url): url is string => Boolean(url)).map(canonical)) : null;
  const result: DayMeals = { breakfast: [], lunch: [], dinner: [] };
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  for (const meal of MEALS) {
    const seen = new Set<string>();
    for (const item of Array.isArray(value[meal]) ? value[meal] as unknown[] : []) {
      const parsed = RestaurantOptionSchema.safeParse(item);
      if (!parsed.success) continue;
      const r = parsed.data;
      const name = r.name.trim().slice(0, 160);
      const key = name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
      const sources = [...new Set(r.sourceUrls.map(safeUrl).filter((url): url is string => Boolean(url)))].filter(url => !observed || observed.has(canonical(url))).slice(0, 3);
      if (!key || seen.has(key) || !sources.length) continue;
      seen.add(key);
      result[meal].push({ ...r, name, cuisine: r.cuisine.slice(0, 100), area: r.area.slice(0, 150), address: r.address?.slice(0, 250) || null,
        whyFits: r.whyFits.slice(0, 350), sourceUrls: sources, officialUrl: safeUrl(r.officialUrl) && (!observed || observed.has(canonical(safeUrl(r.officialUrl)!))) ? safeUrl(r.officialUrl) : null, hoursNote: r.hoursNote?.slice(0, 350) || null,
        pricePerPerson: r.pricePerPerson !== null && Number.isFinite(r.pricePerPerson) && r.pricePerPerson >= 0 ? r.pricePerPerson : null });
      if (result[meal].length === 2) break;
    }
  }
  return result;
}

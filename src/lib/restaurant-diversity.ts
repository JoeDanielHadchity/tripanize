import { MEALS, readMealOptions, type DayMeals, type RestaurantOption } from "./meal-options";
import { safeUrl } from "./maps";

export type RestaurantRef = { name: string; officialUrl?: string | null };

/** Ignore spelling/typography and meal labels, not geography: a venue is used once per trip. */
export function venueName(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/^(?:breakfast|brunch|lunch|dinner|coffee|meal)\s+(?:at|in)\s+/i, "")
    .replace(/&/g, "and").replace(/[^\p{L}\p{N}]/gu, "");
}

export function venueUrl(value: string | null | undefined) {
  const safe = safeUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.hostname = url.hostname.replace(/^www\./, "");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return `${url.hostname}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
}

export class RestaurantRegistry {
  private names = new Set<string>();
  private urls = new Set<string>();
  readonly references: RestaurantRef[] = [];
  constructor(initial: Iterable<RestaurantRef> = []) { for (const ref of initial) this.add(ref); }
  private keys(ref: RestaurantRef) {
    const base = ref.name.split(/\s[-–—|]\s|\s\(/)[0];
    const core = venueName(base.normalize("NFKD").replace(/\p{M}/gu, "").replace(/\b(restaurant|cafe|bistro|brasserie)\b/gi, ""));
    return [venueName(ref.name), venueName(base), ...(core.length >= 4 ? [core] : [])].filter(Boolean);
  }
  has(ref: RestaurantRef) {
    const url = venueUrl(ref.officialUrl);
    return Boolean(this.keys(ref).some(name => this.names.has(name)) || url && this.urls.has(url));
  }
  add(ref: RestaurantRef) {
    const name = venueName(ref.name), url = venueUrl(ref.officialUrl);
    if (!name) return;
    for (const key of this.keys(ref)) this.names.add(key);
    if (url) this.urls.add(url);
    this.references.push({ name: ref.name, officialUrl: ref.officialUrl ?? null });
  }
}

export function restaurantRefs(raw: unknown): RestaurantRef[] {
  const meals = readMealOptions(raw);
  return MEALS.flatMap(meal => meals[meal].map(r => ({ name: r.name, officialUrl: r.officialUrl })));
}

/** The registry is shared across all dates, including earlier chunks and unchanged days. */
export function uniqueMealOptions(raw: unknown, used: RestaurantRegistry, observedSources?: Iterable<string>): DayMeals {
  const result: DayMeals = { breakfast: [], lunch: [], dinner: [] };
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  for (const meal of MEALS) for (const item of Array.isArray(value[meal]) ? value[meal] as unknown[] : []) {
    const option = readMealOptions({ [meal]: [item] }, observedSources)[meal][0];
    if (!option || used.has(option)) continue;
    used.add(option); result[meal].push(option);
    if (result[meal].length === 2) break;
  }
  return result;
}

export function sourceSites(urls: Iterable<string>) {
  const sites = new Set<string>();
  for (const raw of urls) {
    const safe = safeUrl(raw);
    if (!safe) continue;
    const labels = new URL(safe).hostname.toLowerCase().replace(/^www\./, "").split(".");
    // Treat subdomains of the same publisher as one website.
    sites.add(labels.slice(labels.length > 2 && /^(co|com|org|net|gov|ac)$/.test(labels.at(-2)!) ? -3 : -2).join("."));
  }
  return sites;
}

export function mealOptionCount(meals: DayMeals) { return MEALS.reduce((n, meal) => n + meals[meal].length, 0); }
export function optionRef(option: RestaurantOption): RestaurantRef { return { name: option.name, officialUrl: option.officialUrl }; }

import type { DayWeather } from "@/server/weather";
import { formatDate } from "@/lib/dates";

/**
 * Rule-based packing suggestions. Every suggestion carries a human-readable reason so travelers can see why
 * it was added — weather-based reasons say whether they come from a live forecast or typical conditions.
 */
export type PackingContext = {
  nights: number;
  startDate: string | null;
  destinations: { name: string; lat: number | null }[];
  weather: DayWeather[];
  weatherAvailable: boolean;
  activityText: string; // stop titles/categories + interests, lower-cased
  isRoadTrip: boolean;
  accommodationChanges: number;
  laundry: boolean | null;
  children: number;
  accessibility: string | null;
  dietary: string | null;
  international: boolean;
};

export type Suggestion = { label: string; category: string; reason: string; shared: boolean; quantity?: number };

export function normKey(label: string) {
  return label
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .join(" ")
    .trim();
}

function season(month: number, lat: number | null): "winter" | "spring" | "summer" | "autumn" {
  const south = lat !== null && lat < -15;
  const m = south ? ((month + 5) % 12) + 1 : month;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

export function suggestPacking(c: PackingContext): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (s: Suggestion) => {
    if (!out.some((o) => normKey(o.label) === normKey(s.label) && o.shared === s.shared)) out.push(s);
  };
  const days = Math.max(1, c.nights + 1);
  const outfitDays = c.laundry ? Math.min(days, 5) : Math.min(days, 10);
  const laundryNote = c.laundry ? " (laundry available, so packing for up to 5 days)" : c.laundry === false ? " (no laundry planned)" : "";

  // Essentials
  add({ label: "Passport or ID", category: "Documents", reason: c.international ? "International travel" : "ID for check-in and bookings", shared: false });
  add({ label: "Phone charger", category: "Tech", reason: "Daily essential", shared: false });
  add({ label: "Travel insurance details", category: "Documents", reason: "Keep a copy offline", shared: false });
  add({ label: "Personal medication", category: "Health", reason: "Bring enough for the whole trip plus a few extra days", shared: false });
  add({ label: "Toothbrush & toothpaste", category: "Toiletries", reason: "Daily essential", shared: false });
  add({ label: `Underwear × ${outfitDays}`, category: "Clothing", reason: `${days}-day trip${laundryNote}`, shared: false, quantity: outfitDays });
  add({ label: `Socks × ${outfitDays}`, category: "Clothing", reason: `${days}-day trip${laundryNote}`, shared: false, quantity: outfitDays });
  add({ label: `Tops × ${Math.min(outfitDays, 7)}`, category: "Clothing", reason: `${days}-day trip${laundryNote}`, shared: false, quantity: Math.min(outfitDays, 7) });
  add({ label: "Comfortable walking shoes", category: "Clothing", reason: "Most itineraries involve a lot of walking", shared: false });
  add({ label: "First-aid kit", category: "Health", reason: "One per group is enough", shared: true });
  if (c.international) add({ label: "Plug adapter", category: "Tech", reason: "Sockets may differ abroad — check the destination's plug type", shared: true });
  if (c.nights >= 4) add({ label: "Power bank", category: "Tech", reason: "Long days out with maps and tickets on your phone", shared: false });
  if (c.laundry === false && days > 7) add({ label: "Travel laundry detergent", category: "Misc", reason: "Longer trip without planned laundry", shared: true });
  if (c.laundry) add({ label: "Laundry bag", category: "Misc", reason: "You plan to do laundry", shared: false });

  // Weather
  const fc = c.weather.filter((w) => w.kind === "forecast");
  const typ = c.weather.filter((w) => w.kind === "typical");
  const describe = (ws: DayWeather[]) => {
    const dates = ws.map((w) => formatDate(w.date, { day: "numeric", month: "short" }));
    return dates.length > 3 ? `${dates.length} days` : dates.join(", ");
  };
  const rainF = fc.filter((w) => (w.precipProb ?? 0) >= 50 || (w.precipMm ?? 0) >= 3);
  const rainT = typ.filter((w) => (w.precipMm ?? 0) >= 2);
  if (rainF.length) {
    add({ label: "Rain jacket", category: "Clothing", reason: `Forecast: rain likely on ${describe(rainF)}`, shared: false });
    add({ label: "Compact umbrella", category: "Gear", reason: `Forecast: rain likely on ${describe(rainF)}`, shared: false });
  } else if (rainT.length >= Math.max(2, Math.ceil(typ.length / 3))) {
    add({ label: "Rain jacket", category: "Clothing", reason: `Typical for these dates (5-year average, not a forecast): rain on many days`, shared: false });
  }
  const all = [...fc, ...typ];
  const maxT = Math.max(...all.map((w) => w.tMax ?? -99));
  const minT = Math.min(...all.map((w) => w.tMin ?? 99));
  const label = fc.length && !typ.length ? "Forecast" : !fc.length && typ.length ? "Typical for these dates (5-year average, not a forecast)" : "Forecast and typical conditions";
  if (all.length) {
    if (minT <= 5) {
      add({ label: "Warm jacket", category: "Clothing", reason: `${label}: lows around ${Math.round(minT)}°C`, shared: false });
      add({ label: "Hat & gloves", category: "Clothing", reason: `${label}: lows around ${Math.round(minT)}°C`, shared: false });
    } else if (minT <= 12) add({ label: "Light jacket or sweater", category: "Clothing", reason: `${label}: cool evenings around ${Math.round(minT)}°C`, shared: false });
    if (maxT >= 25) {
      add({ label: "Sunscreen", category: "Toiletries", reason: `${label}: highs around ${Math.round(maxT)}°C`, shared: true });
      add({ label: "Sun hat & sunglasses", category: "Clothing", reason: `${label}: highs around ${Math.round(maxT)}°C`, shared: false });
      add({ label: "Reusable water bottle", category: "Gear", reason: `${label}: hot days — stay hydrated`, shared: false });
    }
  } else if (c.startDate) {
    const s = season(Number(c.startDate.slice(5, 7)), c.destinations[0]?.lat ?? null);
    const why = `No weather data available — based on the season (${s}) only`;
    if (s === "winter") add({ label: "Warm jacket", category: "Clothing", reason: why, shared: false });
    if (s === "summer") add({ label: "Sunscreen", category: "Toiletries", reason: why, shared: true });
    if (s === "spring" || s === "autumn") add({ label: "Layers & light jacket", category: "Clothing", reason: why, shared: false });
  }

  // Activities
  const t = c.activityText;
  if (has(t, ["beach", "swim", "snorkel", "pool", "lake", "thermal", "spa", "hot spring"])) {
    add({ label: "Swimwear", category: "Clothing", reason: "Beach, pool or swimming in your plans", shared: false });
    add({ label: "Quick-dry towel", category: "Gear", reason: "Beach, pool or swimming in your plans", shared: false });
  }
  if (has(t, ["hike", "hiking", "trail", "trek", "mountain", "national park", "volcano", "glacier"])) {
    add({ label: "Hiking shoes", category: "Clothing", reason: "Hiking in your plans", shared: false });
    add({ label: "Daypack", category: "Gear", reason: "Hiking in your plans", shared: false });
    add({ label: "Blister plasters", category: "Health", reason: "Hiking in your plans", shared: true });
  }
  if (has(t, ["opera", "gala", "wedding", "fine dining", "michelin", "theatre", "theater", "ballet", "concert hall", "dress code"])) {
    add({ label: "Smart outfit", category: "Clothing", reason: "A formal or dressy event is in your plans", shared: false });
    add({ label: "Dress shoes", category: "Clothing", reason: "A formal or dressy event is in your plans", shared: false });
  }
  if (has(t, ["church", "cathedral", "mosque", "temple", "basilica"])) add({ label: "Scarf or layer covering shoulders", category: "Clothing", reason: "Religious sites often require covered shoulders/knees", shared: false });
  if (has(t, ["ski", "snowboard", "snow"])) add({ label: "Thermal base layers", category: "Clothing", reason: "Snow activities in your plans", shared: false });

  // Road trips & moves
  if (c.isRoadTrip) {
    add({ label: "Driving licence (and international permit if required)", category: "Documents", reason: "Road trip — check whether the country requires an international driving permit", shared: false });
    add({ label: "Phone car mount", category: "Car", reason: "Road trip navigation", shared: true });
    add({ label: "USB car charger", category: "Car", reason: "Road trip navigation", shared: true });
    add({ label: "Snacks & water for the car", category: "Car", reason: "Long driving stretches", shared: true });
    add({ label: "Offline maps downloaded", category: "Tech", reason: "Coverage can drop on rural roads", shared: true });
  }
  if (c.accommodationChanges >= 2) add({ label: "Packing cubes", category: "Gear", reason: `${c.accommodationChanges} accommodation changes — makes repacking quicker`, shared: false });

  if (c.children > 0) {
    add({ label: "Kids' snacks", category: "Kids", reason: `${c.children} child${c.children > 1 ? "ren" : ""} on the trip`, shared: true });
    add({ label: "Kids' entertainment for transit", category: "Kids", reason: `${c.children} child${c.children > 1 ? "ren" : ""} on the trip`, shared: true });
  }
  if (c.accessibility) add({ label: "Mobility or accessibility aids & chargers", category: "Health", reason: "Based on the accessibility needs you shared", shared: false });
  if (c.dietary) add({ label: "Snacks that suit your diet", category: "Misc", reason: `Dietary preferences: ${c.dietary.slice(0, 60)}`, shared: false });
  return out;
}

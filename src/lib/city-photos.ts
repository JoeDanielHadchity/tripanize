/** Our own editorial city photos, used when a trip's destination photo hasn't loaded or doesn't exist. */
const CITY_PHOTOS: [RegExp, string][] = [
  [/\b(lisbon|lisboa|sintra)\b/i, "/editorial/city-guides/lisbon-porto-card-small.webp"],
  [/\b(porto|oporto)\b/i, "/editorial/guide.webp"],
  [/\bparis\b/i, "/editorial/city-guides/paris-card-small.webp"],
  [/\blondon\b/i, "/editorial/city-guides/london-card-small.webp"],
  [/\bistanbul\b/i, "/editorial/city-guides/istanbul-card-small.webp"],
  [/\bbangkok\b/i, "/editorial/city-guides/bangkok-card-small.webp"],
  [/\bhong ?kong\b/i, "/editorial/city-guides/hong-kong-card-small.webp"],
];

export function cityPhoto(destination?: string | null): string | null {
  if (!destination) return null;
  return CITY_PHOTOS.find(([pattern]) => pattern.test(destination))?.[1] ?? null;
}

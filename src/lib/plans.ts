/** Shared product rules. Billing state is read and enforced only on the server. */
export const NORMAL_AI_DAYS = 3;
export const PREMIUM_BANDS = [
  { id: "small", label: "1–2 people", capacity: 2, priceMinor: 900 },
  { id: "medium", label: "3–6 people", capacity: 6, priceMinor: 1500 },
  { id: "large", label: "7–12 people", capacity: 12, priceMinor: 2500 },
] as const;
export type PremiumBandId = typeof PREMIUM_BANDS[number]["id"];
export const premiumBandForPeople = (people: number) => PREMIUM_BANDS.find(b => b.capacity >= people) ?? null;
export const premiumBandForCredit = (credit: number) => [...PREMIUM_BANDS].reverse().find(b => b.priceMinor <= credit) ?? null;
export const premiumPrice = (minor: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(minor / 100);
export type Plan = "NORMAL" | "PREMIUM";
export type PremiumFeature = "expenses" | "chat" | "locations" | "events" | "assistant" | "packing" | "advancedPlanning";
export const PREMIUM_FEATURES: Record<PremiumFeature, string> = {
  expenses: "Expenses and settlements",
  chat: "Trip chat",
  locations: "Member locations",
  events: "Events and suggested bookings",
  assistant: "AI travel assistant",
  packing: "Packing suggestions",
  advancedPlanning: "Extended AI planning and stop alternatives",
};
export const PREMIUM_FEATURE_KEYS = ["advancedPlanning", "expenses", "chat", "locations", "events", "packing", "assistant"] as const satisfies readonly PremiumFeature[];
export const PREMIUM_FEATURE_DETAILS: Record<PremiumFeature, string> = {
  advancedPlanning: "AI plans beyond 3 days, day regeneration and stop alternatives.",
  expenses: "Track payments, attach receipts, split costs and see who owes whom.",
  chat: "Keep the group conversation inside your trip.",
  locations: "See members who choose to share their location. Sharing stays optional.",
  events: "Find events along your route and turn suggestions into bookings.",
  packing: "Get packing suggestions tailored to your trip and weather.",
  assistant: "Ask for itinerary changes, review them and apply them when ready.",
};
export function selectedPremiumFeatures(value: unknown): PremiumFeature[] {
  return PREMIUM_FEATURE_KEYS.filter(key => Array.isArray(value) && value.includes(key));
}
/** Selecting features is a wish list, never a paid entitlement or a per-feature charge. */
export function tripCheckoutQuote(features: readonly PremiumFeature[], people: number, creditMinor: number) {
  const band = premiumBandForPeople(people);
  return { band, dueMinor: features.length === 0 ? 0 : band ? Math.max(0, band.priceMinor - creditMinor) : null };
}
export const PLAN_COMPARISON = [
  { feature: "AI itinerary", normal: "First 3 days per trip", premium: "All trip days" },
  { feature: "Manual itinerary changes", normal: "All days", premium: "All days" },
  { feature: "Bookings", normal: "Add manually", premium: "Manual and suggested bookings" },
  { feature: "Packing", normal: "Add items manually", premium: "Manual items and suggestions" },
  { feature: "Expenses and settlements", normal: "—", premium: "Included" },
  { feature: "Chat and member locations", normal: "—", premium: "Included" },
  { feature: "Events, AI assistant and AI edits", normal: "—", premium: "Included" },
] as const;

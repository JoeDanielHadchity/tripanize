/** Shared product rules. Billing state is read and enforced only on the server. */
export const NORMAL_AI_DAYS = 2;
export const PREMIUM_PRICE_MINOR = 1500;
/** One trip purchase covers the whole group, with no group-size pricing limit. */
export const PREMIUM_BANDS = [{ id: "premium", label: "Any group size", capacity: Number.MAX_SAFE_INTEGER, priceMinor: PREMIUM_PRICE_MINOR }] as const;
export type PremiumBandId = "premium";
export const premiumBandForPeople = (_people: number) => PREMIUM_BANDS[0];
export const premiumBandForCredit = (credit: number) => credit > 0 ? PREMIUM_BANDS[0] : null;
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
  advancedPlanning: "AI plans beyond 2 days, day regeneration and stop alternatives.",
  expenses: "Track payments, scan receipts with AI, split costs and see who owes whom.",
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
  return { band, dueMinor: features.length === 0 || creditMinor > 0 ? 0 : band.priceMinor };
}
export const PLAN_COMPARISON = [
  { feature: "AI itinerary", normal: "First 2 days per trip", premium: "All trip days" },
  { feature: "Organizer, editors and viewers", normal: "Included", premium: "Included" },
  { feature: "Group size", normal: "Any group size", premium: "Any group size · one $15 payment" },
  { feature: "Manual itinerary changes", normal: "All days", premium: "All days" },
  { feature: "Bookings", normal: "Add manually", premium: "Linked event suggestions and manual bookings" },
  { feature: "Booking deadline reminders", normal: "Included", premium: "Included" },
  { feature: "Group voting", normal: "Included", premium: "Included" },
  { feature: "AI receipt scanning", normal: "—", premium: "Review and autofill expense details" },
  { feature: "Packing", normal: "Add items manually", premium: "Customized for weather, season, preferences and events" },
  { feature: "Expenses and settlements", normal: "—", premium: "Included" },
  { feature: "Chat and member locations", normal: "—", premium: "Included" },
  { feature: "Events, AI assistant and AI edits", normal: "—", premium: "Included" },
] as const;

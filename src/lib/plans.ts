/** Shared product rules. Billing state is read and enforced only on the server. */
export const NORMAL_AI_DAYS = 3;
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
export const PLAN_COMPARISON = [
  { feature: "AI itinerary", normal: "First 3 days per trip", premium: "All trip days" },
  { feature: "Manual itinerary changes", normal: "All days", premium: "All days" },
  { feature: "Bookings", normal: "Add manually", premium: "Manual and suggested bookings" },
  { feature: "Packing", normal: "Add items manually", premium: "Manual items and suggestions" },
  { feature: "Expenses and settlements", normal: "—", premium: "Included" },
  { feature: "Chat and member locations", normal: "—", premium: "Included" },
  { feature: "Events, AI assistant and AI edits", normal: "—", premium: "Included" },
] as const;

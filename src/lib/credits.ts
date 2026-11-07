/**
 * The one price list for AI actions, in credits, shared by the website, the app and the server.
 * Set so that one credit never costs Tripanize more than about 2¢ of AI (see the credits design doc).
 */
export const CREDIT_PRICES = {
  /** Planning or regenerating one day with AI, restaurants included. */
  planDay: 3,
  /** Refreshing restaurant ideas for one day. */
  restaurantsDay: 1,
  /** An event search someone asks for (automatic checks are free). */
  events: 3,
  /** Finding a destination: five ideas. */
  destination: 4,
  /** One AI assistant question. */
  assistant: 2,
  /** Alternatives for one stop. */
  swap: 2,
  /** Packing suggestions. */
  packing: 1,
} as const;

/** Free, once, for every verified account. */
export const WELCOME_CREDITS = 15;
/** The AI credits included with a $15 Premium trip (the Starter bundle). */
export const PREMIUM_INCLUDED_CREDITS = 100;
/** Once, for every account invited to Premium before credits launched. */
export const INVITED_PREMIUM_CREDITS = 500;

export type CreditBundle = { id: "starter" | "plus" | "pro" | "topup"; name: string; priceCents: number; credits: number; unlocksPremium: boolean };
export const CREDIT_BUNDLES: readonly CreditBundle[] = [
  { id: "starter", name: "Starter", priceCents: 1500, credits: 100, unlocksPremium: true },
  { id: "plus", name: "Plus", priceCents: 2500, credits: 200, unlocksPremium: true },
  { id: "pro", name: "Pro", priceCents: 5000, credits: 500, unlocksPremium: true },
  { id: "topup", name: "Top-up", priceCents: 500, credits: 30, unlocksPremium: false },
];

/** Credits for planning a number of days (setup adds events and packing on Premium trips). */
export function planPrice(days: number, opts: { setup?: boolean; premium?: boolean } = {}) {
  return Math.max(0, days) * CREDIT_PRICES.planDay + (opts.setup && opts.premium ? CREDIT_PRICES.events + CREDIT_PRICES.packing : 0);
}

/** How each kind of spending reads in credit history (website and app). */
export const CREDIT_SPEND_LABELS: Record<string, string> = {
  plan: "Planned days with AI", regenerate: "Regenerated days with AI", restaurants: "Restaurant ideas", events: "Event search",
  destination: "Destination ideas", assistant: "AI assistant", swap: "Stop alternatives", packing: "Packing suggestions",
};
/** The price list people see (website and app). */
export const CREDIT_COSTS: readonly [string, number | "Free"][] = [
  ["Plan or regenerate one day with AI (restaurants included)", CREDIT_PRICES.planDay],
  ["Find events for your trip", CREDIT_PRICES.events],
  ["Find a destination (5 ideas). Your first search is free", CREDIT_PRICES.destination],
  ["Ask the AI assistant", CREDIT_PRICES.assistant],
  ["Swap a stop for alternatives", CREDIT_PRICES.swap],
  ["Packing suggestions", CREDIT_PRICES.packing],
  ["Refresh restaurant ideas, per day", CREDIT_PRICES.restaurantsDay],
  ["Scan a receipt", "Free"],
  ["Automatic event checks before your trip (up to 10)", "Free"],
];
/** One credit-history line's label. */
export function creditEntryLabel(h: { kind: string; note: string | null }) {
  return h.kind === "spend" ? CREDIT_SPEND_LABELS[h.note ?? ""] ?? "AI" : h.kind === "welcome" ? "Welcome credits" : h.kind === "purchase" ? h.note ?? "Top up" : h.note ?? (h.kind === "grant" ? "Credits from Tripanize" : "Adjusted by Tripanize");
}
/** "1 credit", "3 credits". */
export const creditsText = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

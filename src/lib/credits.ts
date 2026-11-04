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

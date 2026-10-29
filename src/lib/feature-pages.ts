/** Public product navigation. Keep these separate from private trip workspaces. */
export const FEATURE_PAGES = [
  { href: "/ai-trip-planner", label: "Trip Planner", description: "A day-by-day plan shaped around your trip." },
  { href: "/group-trip-planner", label: "Group Travel", description: "One shared plan, with the right role for everyone." },
  { href: "/travel-expense-splitter", label: "Expense splitter", description: "Track spending and see who owes whom." },
] as const;

export type FeaturePath = typeof FEATURE_PAGES[number]["href"];

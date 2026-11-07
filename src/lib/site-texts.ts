/** Wording that can be changed on the Company page (Texts). The text here is the
 * default; a saved change replaces it on the website and in the app. Shared by
 * the website, the server and the app, so it has no imports. */
export const SITE_TEXTS = {
  // Website · home
  "web.home.title1": { group: "Website · Home", label: "Headline, first line", text: "Plan less." },
  "web.home.title2": { group: "Website · Home", label: "Headline, second line", text: "Travel more." },
  "web.home.subtitle": { group: "Website · Home", label: "Under the headline", text: "Your trip planner, bookings and group in one place." },
  "web.home.cta": { group: "Website · Home", label: "Main button", text: "Create a trip" },
  "web.home.example": { group: "Website · Home", label: "Second button", text: "View example trip" },
  "web.home.features": { group: "Website · Home", label: "Features heading", text: "Your trip, together." },
  "web.home.f1.title": { group: "Website · Home", label: "Feature 1 title", text: "Plan each day" },
  "web.home.f1.text": { group: "Website · Home", label: "Feature 1 text", text: "Edit your itinerary, one day at a time." },
  "web.home.f2.title": { group: "Website · Home", label: "Feature 2 title", text: "Events & bookings" },
  "web.home.f2.text": { group: "Website · Home", label: "Feature 2 text", text: "Event suggestions linked to bookings." },
  "web.home.f3.title": { group: "Website · Home", label: "Feature 3 title", text: "Travel together" },
  "web.home.f3.text": { group: "Website · Home", label: "Feature 3 text", text: "Share plans, chat and split expenses." },
  "web.home.fare.title": { group: "Website · Home", label: "Price box heading", text: "Start free. Upgrade for $15." },
  "web.home.fare.text": { group: "Website · Home", label: "Price box text", text: "One payment. All travelers." },
  // Website · feature pages
  "web.planner.eyebrow": { group: "Website · Trip planner page", label: "Small line above the title", text: "A little direction. A lot of possibility." },
  "web.planner.title": { group: "Website · Trip planner page", label: "Title", text: "Trip Planner." },
  "web.planner.emphasis": { group: "Website · Trip planner page", label: "Title, second line", text: "Your kind of trip." },
  "web.planner.intro": { group: "Website · Trip planner page", label: "Introduction", text: "Turn your dates, interests and travel pace into an editable day-by-day itinerary. Keep the ideas you like. Make the rest your own.", long: true },
  "web.group.eyebrow": { group: "Website · Group travel page", label: "Small line above the title", text: "Less back-and-forth. More going together." },
  "web.group.title": { group: "Website · Group travel page", label: "Title", text: "Group Travel." },
  "web.group.emphasis": { group: "Website · Group travel page", label: "Title, second line", text: "Everyone on the same page." },
  "web.group.intro": { group: "Website · Group travel page", label: "Introduction", text: "Share one itinerary, keep bookings together and choose who can edit. Your group has a plan everyone can find.", long: true },
  "web.expenses.eyebrow": { group: "Website · Expense splitter page", label: "Small line above the title", text: "Enjoy the trip. Keep the numbers clear." },
  "web.expenses.title": { group: "Website · Expense splitter page", label: "Title", text: "Expense splitter." },
  "web.expenses.emphasis": { group: "Website · Expense splitter page", label: "Title, second line", text: "Fair from the first payment." },
  "web.expenses.intro": { group: "Website · Expense splitter page", label: "Introduction", text: "Record who paid, split the cost and see who owes whom. Keep receipts with each payment and actual spending separate from estimates.", long: true },
  // App · home
  "app.welcome.eyebrow": { group: "App · Welcome screen (signed out)", label: "Small line above the headline", text: "Your trip organizer" },
  "app.welcome.title": { group: "App · Welcome screen (signed out)", label: "Headline", text: "Plan less.\nTravel more.", long: true },
  "app.welcome.subtitle": { group: "App · Welcome screen (signed out)", label: "Under the headline", text: "Your itinerary, bookings and group in one place." },
  "app.welcome.cta": { group: "App · Welcome screen (signed out)", label: "Main button", text: "Plan a trip — it's free" },
  "app.welcome.example": { group: "App · Welcome screen (signed out)", label: "Second button", text: "See an example trip" },
  "app.home.explore.title": { group: "App · Home", label: "Explore heading", text: "Explore Tripanize" },
  "app.home.explore.subtitle": { group: "App · Home", label: "Explore subheading", text: "Everything your trip needs" },
  "app.home.ideas.title": { group: "App · Home", label: "Trip ideas heading", text: "Trip ideas" },
  "app.home.ideas.subtitle": { group: "App · Home", label: "Trip ideas subheading", text: "Ready-made itineraries to make your own" },
  "app.home.premium.eyebrow": { group: "App · Home", label: "Premium card, small line", text: "One trip · everyone included" },
  "app.home.premium.title": { group: "App · Home", label: "Premium card heading", text: "Start free. Upgrade a trip for $15." },
  "app.home.premium.text": { group: "App · Home", label: "Premium card text", text: "Every day planned, group chat, shared expenses and events nearby. One payment, no subscription.", long: true },
} as const satisfies Record<string, { group: string; label: string; text: string; long?: boolean }>;

export type SiteTextKey = keyof typeof SITE_TEXTS;
export type SiteTexts = Record<SiteTextKey, string>;
export const SITE_TEXT_MAX = 600;

/** Saved changes over the defaults. */
export function withDefaults(saved: Partial<Record<string, string>>): SiteTexts {
  const out = {} as SiteTexts;
  for (const key of Object.keys(SITE_TEXTS) as SiteTextKey[]) out[key] = saved[key] ?? SITE_TEXTS[key].text;
  return out;
}

import { z } from "zod";
import { DayMealsSchema, type DayMeals } from "@/lib/meal-options";

/**
 * Structured output contract for the AI planner. Every field is required (nullable where optional) so it can be
 * used with OpenAI strict structured outputs. Semantic validation happens afterwards in checks.ts — the model's
 * output is treated as untrusted input until it passes both layers.
 */
export const PlanStopSchema = z.object({
  title: z.string().describe("Name of the place or activity"),
  category: z.enum(["sight", "museum", "food", "cafe", "nature", "shopping", "activity", "nightlife", "transport", "accommodation", "rest", "event", "other"]),
  locationName: z.string().nullable().describe("Place name as it appears on maps"),
  address: z.string().nullable().describe("Street address or clearly identified location"),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  reason: z.string().describe("One or two sentences: why this fits these travelers"),
  startTime: z.string().describe("Suggested local start time, HH:MM 24h"),
  durationMin: z.number().int().describe("Realistic visit duration in minutes"),
  travelToNextMin: z.number().int().nullable().describe("Estimated minutes to reach the next stop; null for the last stop"),
  travelMode: z.enum(["walking", "transit", "driving", "taxi", "cycling"]).nullable(),
  travelNote: z.string().nullable(),
  estCost: z.number().nullable().describe("Estimated total cost for the whole group in the planning currency; null if unknown, 0 if free"),
  bookingRequired: z.boolean(),
  bookingNote: z.string().nullable().describe("What to book and how far ahead. Never claim something is already booked."),
  hoursNote: z.string().nullable().describe("Opening days/hours caveat; say if unverified"),
  hoursVerified: z.boolean().describe("True only if opening hours were checked against an official or reliable current source"),
  officialUrl: z.string().nullable().describe("Official website or ticketing page, only if found via search"),
  sourceUrls: z.array(z.string()).describe("Sources consulted for hours/prices"),
  isMeal: z.boolean(),
  isFreeTime: z.boolean().describe("Unstructured time to rest or explore"),
  indoor: z.boolean().nullable(),
});

export const PlanDaySchema = z.object({
  meals: DayMealsSchema.describe("Two sourced restaurant options for breakfast, lunch and dinner. These are alternatives, not additional scheduled stops."),
  date: z.string().describe("YYYY-MM-DD"),
  area: z.string().describe("Main destination or neighborhood for the day"),
  title: z.string().describe("Short theme for the day"),
  isTravelDay: z.boolean().describe("True for days dominated by moving between destinations"),
  driveMinutes: z.number().int().nullable().describe("Total driving time for road-trip days, else null"),
  stops: z.array(PlanStopSchema).describe("Plan A, in chronological order. Excludes the fixed items listed in the request."),
  planB: z.array(PlanStopSchema).describe("Optional bad-weather/indoor alternative for the day; empty if not useful"),
  planBNote: z.string().nullable(),
  notes: z.array(z.string()).describe("Practical notes: transport passes, parking, check-in/out, closures"),
  questions: z.array(z.string()).describe("Unresolved questions for the travelers"),
  estCost: z.number().nullable().describe("Estimated total cost of Plan A for the group"),
});

export const ProposalSchema = z.object({
  summary: z.string(),
  days: z.array(PlanDaySchema),
  unplacedMustSees: z.array(z.object({ name: z.string(), reason: z.string(), options: z.array(z.string()) })).describe("Every must-see that could not be fitted, with the conflict and choices"),
  generalNotes: z.array(z.string()),
});

export const SwapSchema = z.object({
  alternatives: z.array(PlanStopSchema).describe("3 to 4 comparable alternatives"),
  note: z.string().nullable(),
});

export const EventsSchema = z.object({
  events: z.array(
    z.object({
      title: z.string(),
      category: z.enum(["exhibition", "concert", "performance", "festival", "seasonal", "opening", "sports", "market", "cultural", "other"]),
      date: z.string().nullable().describe("YYYY-MM-DD start date if known"),
      endDate: z.string().nullable(),
      startTime: z.string().nullable().describe("HH:MM if known"),
      dateVerified: z.boolean().describe("True only if the date was confirmed on the organizer/venue/tourism-office page"),
      venue: z.string().nullable(),
      city: z.string(),
      address: z.string().nullable(),
      officialUrl: z.string().nullable(),
      bookingUrl: z.string().nullable(),
      priceText: z.string().nullable().describe("Price as stated by the source, or null if not verified"),
      availability: z.string().nullable(),
      bookingDeadline: z.string().nullable(),
      cancelled: z.boolean(),
      soldOut: z.boolean(),
      whyFits: z.string(),
      uncertainty: z.string().nullable().describe("What remains unverified"),
      sources: z.array(z.object({ url: z.string(), title: z.string().nullable() })),
    }),
  ),
});

export type PlanStop = z.infer<typeof PlanStopSchema>;
// Stored drafts/checkpoints from before meal recommendations remain readable.
export type PlanDay = Omit<z.infer<typeof PlanDaySchema>, "meals"> & { meals?: DayMeals };
export type Proposal = Omit<z.infer<typeof ProposalSchema>, "days"> & { days: PlanDay[] };
export type SwapResult = z.infer<typeof SwapSchema>;
export type EventsResult = z.infer<typeof EventsSchema>;

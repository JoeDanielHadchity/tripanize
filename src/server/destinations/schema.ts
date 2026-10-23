import { z } from "zod";
import { isDateStr } from "@/lib/dates";

export const DISCOVERY_INTERESTS = ["Beaches & islands", "Food & markets", "History & culture", "Nature & hiking", "Cities & shopping", "Relaxation & wellness", "Adventure & sport", "Nightlife", "Festivals & local traditions", "Family activities"];
export const discoveryInput = z.object({
  departureCity: z.string().trim().min(2, "Add your departure city and country.").max(120),
  timing: z.enum(["dates", "month", "flexible"]),
  startDate: z.string().max(10).default(""), endDate: z.string().max(10).default(""),
  month: z.string().max(7).default(""),
  days: z.number().int().min(2).max(30),
  adults: z.number().int().min(1).max(50), children: z.number().int().min(0).max(50),
  budget: z.number().int().min(100).max(100000),
  climate: z.enum(["Warm & sunny", "Mild & comfortable", "Cold or snowy", "No preference"]),
  interests: z.array(z.enum(DISCOVERY_INTERESTS)).min(1, "Choose at least one interest.").max(10),
  pace: z.enum(["RELAXED", "BALANCED", "AMBITIOUS"]),
  distance: z.enum(["Nearby — up to 3 hours", "Up to 6 hours", "Anywhere"]),
  crowds: z.enum(["Quiet & less crowded", "A balance", "Lively & popular"]),
  constraints: z.string().trim().max(800).default(""),
}).superRefine((v, ctx) => {
  const today = new Date().toISOString().slice(0, 10);
  if (v.timing === "dates" && (!isDateStr(v.startDate) || !isDateStr(v.endDate) || v.endDate < v.startDate || v.startDate < today || Date.parse(v.endDate) - Date.parse(v.startDate) > 29 * 86400000)) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Choose upcoming dates for a trip of 2–30 days." });
  if (v.timing === "dates" && v.startDate === v.endDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Choose at least two travel days." });
  if (v.timing === "month" && (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.month) || v.month < today.slice(0, 7))) ctx.addIssue({ code: "custom", path: ["month"], message: "Choose this month or a future month." });
});
export type DiscoveryInput = z.infer<typeof discoveryInput>;
// Drafts may be incomplete; full timing/interest validation happens before research.
export const discoveryDraftInput = z.object({ ...discoveryInput.shape, departureCity: z.string().trim().max(120), interests: z.array(z.enum(DISCOVERY_INTERESTS)).max(10) });
export const DISCOVERY_DEFAULTS: DiscoveryInput = { departureCity: "", timing: "month", startDate: "", endDate: "", month: "", days: 7, adults: 2, children: 0, budget: 1500, climate: "Mild & comfortable", interests: [], pace: "BALANCED", distance: "Up to 6 hours", crowds: "A balance", constraints: "" };
const output = (text: (max: number) => z.ZodString) => z.object({
  summary: text(600),
  ideas: z.array(z.object({
    destination: text(120), country: text(80),
    whyFits: text(700), bestTime: text(200),
    weather: text(400), weatherKind: z.enum(["seasonal", "forecast", "unavailable"]),
    season: text(300), experiences: z.array(text(120)).min(2).max(4),
    budgetNote: text(400), travelNote: text(300), tradeoff: text(400),
    sourceUrls: z.array(z.string().max(1000)).max(5),
  })).length(5),
});
// The API transports structured content. Character limits belong to the app's
// presentation layer, where longer model descriptions can be safely shortened.
export const discoveryWireResult = output(() => z.string());
export const discoveryResult = output(max => z.string().trim().min(1).max(max));
export type DiscoveryResult = z.infer<typeof discoveryResult>;
function plainCopy(value: string) {
  return value
    // Research tools can append Markdown citations inside structured strings.
    // Sources have their own verified, clickable links on each destination card.
    .replace(/\s*\(\[[^\]]+\]\(https?:\/\/[^\s)]+\)\)/g, "")
    .replace(/\s*\(\[[^\]]+\]\(https?:\/\/[^\s]*$/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/g, "$1")
    .replace(/cite[^]*/g, "")
    .replace(/\s+/g, " ").trim();
}
export function normalizeDiscoveryResult(value: z.infer<typeof discoveryWireResult>): DiscoveryResult {
  const limits = { destination: 120, country: 80, whyFits: 700, bestTime: 200, weather: 400, season: 300, budgetNote: 400, travelNote: 300, tradeoff: 400 } as const;
  const ideas = value.ideas.map(idea => {
    const clean = { ...idea };
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
      const text = plainCopy(idea[key]); const limit = limits[key];
      // Avoid splitting a word or a surrogate pair when shortening display copy.
      clean[key] = text.length <= limit ? text : [...text].join("").slice(0, limit - 1).replace(/\s+\S*$/, "").replace(/[\uD800-\uDBFF]$/, "") + "…";
    }
    clean.experiences = idea.experiences.map(x => plainCopy(x).slice(0, 120));
    return clean;
  });
  return discoveryResult.parse({ summary: plainCopy(value.summary).slice(0, 600), ideas });
}

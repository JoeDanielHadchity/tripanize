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
const text = (max: number) => z.string().trim().min(1).max(max);
export const discoveryResult = z.object({
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
export type DiscoveryResult = z.infer<typeof discoveryResult>;

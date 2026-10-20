import { z } from "zod";
import { isDateStr, isTimeStr, isValidTimeZone } from "@/lib/dates";

const str = (max = 200) => z.string().trim().max(max);
const optStr = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isDateStr(v), "Use a valid date");
const optTime = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isTimeStr(v), "Use HH:MM");
const optDateTime = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v.slice(0, 16) : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Use a valid date and time");

export const destinationInput = z.object({
  id: z.string().optional(),
  name: str(120).min(1, "Destination name is required"),
  country: optStr(80),
  arriveDate: optDate,
  departDate: optDate,
  accommodationName: optStr(160),
  accommodationAddress: optStr(240),
  neighborhood: optStr(120),
  checkInTime: optTime,
  checkOutTime: optTime,
  parkingNotes: optStr(400),
});

export const commitmentInput = z.object({
  title: str(160).min(1),
  date: z.string().refine(isDateStr, "Commitment needs a date"),
  startTime: optTime,
  durationMin: z.coerce.number().int().min(5).max(24 * 60).optional().nullable(),
  location: optStr(240),
});

export const tripInput = z
  .object({
    name: str(120).min(1, "Give your trip a name"),
    startDate: optDate,
    endDate: optDate,
    timezone: z.string().optional().nullable().transform((v) => (v && isValidTimeZone(v) ? v : null)),
    currency: z.string().regex(/^[A-Z]{3}$/, "Choose a currency").default("EUR"),
    budget: optStr(20),
    pace: z.enum(["RELAXED", "BALANCED", "AMBITIOUS"]).default("BALANCED"),
    interests: z.array(str(60)).max(30).default([]),
    transport: z.array(str(60)).max(15).default([]),
    accessibility: optStr(1000),
    preferences: optStr(1000),
    dietary: optStr(500),
    restaurantPrefs: optStr(500),
    departureCity: optStr(120),
    arrivalLocation: optStr(160),
    arrivalAt: optDateTime,
    departureLocation: optStr(160),
    departureAt: optDateTime,
    adults: z.coerce.number().int().min(1).max(50).default(1),
    children: z.coerce.number().int().min(0).max(50).default(0),
    isRoadTrip: z.boolean().default(false),
    carPickupLocation: optStr(160),
    carPickupAt: optDateTime,
    carReturnLocation: optStr(160),
    carReturnAt: optDateTime,
    notes: optStr(2000),
    travelers: z.array(z.object({ name: str(80).min(1), isChild: z.boolean().default(false) })).max(30).default([]),
    destinations: z.array(destinationInput).max(30).default([]),
    mustSee: z.array(str(160).min(1)).max(50).default([]),
    optional: z.array(str(160).min(1)).max(50).default([]),
    commitments: z.array(commitmentInput).max(50).default([]),
  })
  .superRefine((t, ctx) => {
    if ((t.startDate && !t.endDate) || (!t.startDate && t.endDate)) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Set both start and end dates, or neither" });
    if (t.startDate && t.endDate && t.endDate < t.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is before start date" });
    if (t.startDate && t.endDate && Date.parse(t.endDate) - Date.parse(t.startDate) > 120 * 86400000) ctx.addIssue({ code: "custom", path: ["endDate"], message: "Trips can be up to 120 days" });
    t.destinations.forEach((d, i) => {
      if (d.arriveDate && d.departDate && d.departDate < d.arriveDate) ctx.addIssue({ code: "custom", path: ["destinations", i, "departDate"], message: `${d.name}: leave date is before arrival` });
      if (t.startDate && t.endDate) {
        for (const k of ["arriveDate", "departDate"] as const) {
          const v = d[k];
          if (v && (v < t.startDate || v > t.endDate)) ctx.addIssue({ code: "custom", path: ["destinations", i, k], message: `${d.name}: dates must be within the trip` });
        }
      }
    });
    t.commitments.forEach((c, i) => {
      if (t.startDate && t.endDate && (c.date < t.startDate || c.date > t.endDate)) ctx.addIssue({ code: "custom", path: ["commitments", i, "date"], message: `“${c.title}” is outside the trip dates` });
    });
  });

export type TripInput = z.input<typeof tripInput>;
export type TripParsed = z.output<typeof tripInput>;

export function formatZodError(err: z.ZodError) {
  return err.issues.map((i) => i.message).filter((m, idx, arr) => arr.indexOf(m) === idx).join(" · ");
}

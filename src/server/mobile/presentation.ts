import type { MobileAction, MobileBlock, MobileField, MobileTarget, MobileValue, MobileValues } from "@/lib/mobile-workspace";
import { prisma } from "@/server/db";
import { minorToDecimalString } from "@/lib/money";

export const options = (values: readonly string[]) => values.map(value => ({ value, label: value.replace(/_/g, " ") }));
export const f = (key: string, label: string, kind: MobileField["kind"] = "text", rest: Partial<MobileField> = {}): MobileField => ({ key, label, kind, ...rest });
export const act = (label: string, action: string, values: MobileValues = {}, confirm?: string): MobileAction => ({ label, action, values, ...(confirm ? { confirm } : {}) });
export const go = (label: string, screen: string, tripId?: string, item?: string): MobileAction => ({ label, to: { screen, ...(tripId ? { tripId } : {}), ...(item ? { item } : {}) } });
export const link = (label: string, url: string | null | undefined): MobileAction[] => url ? [{ label, url }] : [];
export const form = (id: string, title: string, action: string, fields: MobileField[], values: MobileValues = {}, label = "Save"): MobileBlock => ({ id, title, form: { action, fields, values, label } });
export const target = (screen: string, tripId?: string, item?: string): MobileTarget => ({ screen, ...(tripId ? { tripId } : {}), ...(item ? { item } : {}) });
export const wire = (value: unknown): MobileValue => JSON.parse(JSON.stringify(value)) as MobileValue;
export const tripFields = (): MobileField[] => [
  f("name", "Trip name", "text", { required: true }), f("startDate", "Start date", "date"), f("endDate", "End date", "date"),
  f("destinations", "Destinations", "repeat", { max: 30, fields: [f("name", "Destination", "text", { required: true }), f("country", "Country"), f("arriveDate", "Arrival date", "date"), f("departDate", "Departure date", "date"), f("accommodationName", "Accommodation"), f("accommodationAddress", "Accommodation address"), f("neighborhood", "Neighborhood"), f("checkInTime", "Check-in", "time"), f("checkOutTime", "Check-out", "time"), f("parkingNotes", "Parking notes")] }),
  f("departureCity", "Traveling from"), f("timezone", "Destination time zone", "text", { hint: "For example Europe/Paris. Leave blank to detect it." }), f("currency", "Currency", "text", { required: true }), f("budget", "Group budget", "money"),
  f("adults", "Adults", "number"), f("children", "Children", "number"), f("pace", "Pace", "select", { options: options(["RELAXED", "BALANCED", "AMBITIOUS"]) }),
  f("interests", "Interests", "list", { hint: "One per line" }), f("transport", "Transport", "list"), f("dietary", "Dietary needs & allergies", "long"), f("restaurantPrefs", "Restaurant preferences", "long"), f("accessibility", "Accessibility needs", "long"), f("preferences", "Travel preferences", "long"),
  f("arrivalLocation", "Arrival airport / station"), f("arrivalAt", "Arrival date & time", "text", { hint: "YYYY-MM-DDTHH:MM" }), f("departureLocation", "Departure airport / station"), f("departureAt", "Departure date & time", "text", { hint: "YYYY-MM-DDTHH:MM" }),
  f("isRoadTrip", "Road trip", "check"), f("carPickupLocation", "Car pickup location"), f("carPickupAt", "Car pickup date & time"), f("carReturnLocation", "Car return location"), f("carReturnAt", "Car return date & time"),
  f("mustSee", "Must-see places", "list"), f("optional", "Optional places", "list"),
  f("notes", "Notes", "long"),
];
export async function tripFormValues(tripId: string): Promise<MobileValues> {
  const t = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" } }, places: true, stops: { where: { isFixed: true, origin: "COMMITMENT" }, include: { day: true } } } });
  const keys = ["name", "startDate", "endDate", "timezone", "currency", "pace", "interests", "transport", "accessibility", "preferences", "dietary", "restaurantPrefs", "departureCity", "arrivalLocation", "arrivalAt", "departureLocation", "departureAt", "adults", "children", "isRoadTrip", "carPickupLocation", "carPickupAt", "carReturnLocation", "carReturnAt", "notes", "version"] as const;
  const values = Object.fromEntries(keys.map(key => [key, wire(t[key])]));
  return { ...values, budget: t.budgetMinor === null ? "" : minorToDecimalString(t.budgetMinor, t.currency), travelers: [],
    destinations: t.destinations.map(d => wire(d)), mustSee: t.places.filter(p => p.kind === "MUST_SEE").map(p => p.name), optional: t.places.filter(p => p.kind === "OPTIONAL").map(p => p.name),
    commitments: t.stops.map(s => ({ title: s.title, date: s.day?.date ?? "", startTime: s.startTime, durationMin: s.durationMin, location: s.address })),
  };
}

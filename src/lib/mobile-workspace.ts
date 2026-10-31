/** Serializable presentation contract. Native views render these with native
 * controls; no HTML, executable code, service names or database access crosses it. */
export type MobileValue = string | number | boolean | null | MobileValue[] | { [key: string]: MobileValue };
export type MobileValues = Record<string, MobileValue>;
export type MobileTarget = { screen: string; tripId?: string; item?: string; day?: string; before?: string };
export type MobileField = {
  key: string; label: string; kind?: "text" | "long" | "list" | "number" | "money" | "date" | "time" | "select" | "multi" | "check" | "repeat" | "files";
  value?: MobileValue; required?: boolean; hint?: string; options?: { value: string; label: string }[]; fields?: MobileField[]; max?: number;
};
export type MobileAction = { label: string; action?: string; values?: MobileValues; to?: MobileTarget; url?: string; confirm?: string; danger?: boolean; device?: "location" | "file" | "offline" | "purchase"; fileName?: string };
export type MobileBlock = {
  id: string; title?: string; text?: string; meta?: string; tone?: "accent" | "warning";
  image?: { url: string; credit?: string };
  lines?: string[]; actions?: MobileAction[]; form?: { action: string; label: string; values?: MobileValues; fields: MobileField[]; confirm?: string; upload?: "expense" | "booking" | "scan" };
  location?: { tripId: string };
  stop?: { time: string | null; durationMin: number | null; place: string | null; status: string; category: string; travelToNextMin: number | null; travelMode: string | null };
  restaurant?: { meal: "breakfast" | "lunch" | "dinner"; option: number; name: string; cuisine: string; area: string; hoursNote: string | null };

};
export type MobileItinerary = {
  days: { id: string; date: string; stops: number; travel: boolean }[];
  selectedDay?: { id: string; date: string; title: string; area?: string; activePlan: "A" | "B"; travelMinutes?: number; estimatedCost?: string; planActions: MobileAction[] };
  checklist: { label: string; done: boolean; to: MobileTarget }[];
};
export type MobileWorkspace = {
  title: string; subtitle?: string; tripId?: string; premium?: boolean; role?: string;
  trip?: { name: string; destinations: string[]; startDate: string | null; endDate: string | null };
  itinerary?: MobileItinerary;
  tabs?: { label: string; to: MobileTarget; premium?: boolean }[]; blocks: MobileBlock[]; pollMs?: number;
};
export type MobileCommandResult = { message?: string; to?: MobileTarget; refresh?: boolean; url?: string; signedOut?: boolean; review?: { title: string; lines: string[]; action: string; values: MobileValues } };

/** Shared labels keep the fixed trip bar stable while another section loads. */
export function mobileTripTabs(tripId: string): NonNullable<MobileWorkspace["tabs"]> {
  return [
    { label: "Itinerary", to: { screen: "itinerary", tripId } },
    { label: "Expenses", to: { screen: "expenses", tripId }, premium: true },
    { label: "Chat & locations", to: { screen: "chat", tripId }, premium: true },
    { label: "Events & bookings", to: { screen: "bookings", tripId } },
    { label: "Packing", to: { screen: "packing", tripId } },
    { label: "Trip settings", to: { screen: "settings", tripId } },
  ];
}

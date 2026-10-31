import type { MobileTarget } from "./workspace";

/** Sections switched in place inside one trip screen (tab bar and "More"),
 * instead of stacking a new screen for every tap. Detail screens (a stop,
 * a booking, a payment form…) are still pushed on top with a slide. */
export const TRIP_SECTIONS = new Set(["itinerary", "expenses", "chat", "locations", "bookings", "events", "packing", "settings", "sharing", "votes", "premium", "versions", "setup"]);
export const SECTION_ORDER = ["itinerary", "expenses", "chat", "locations", "bookings", "events", "packing", "votes", "sharing", "settings", "premium", "versions", "setup"];
export const isSection = (to: MobileTarget) => Boolean(to.tripId) && TRIP_SECTIONS.has(to.screen);

type Listener = (to: MobileTarget) => void;
const bases = new Map<string, Listener[]>();

/** The trip screen underneath detail screens listens here, so a detail screen
 * can close itself and hand its destination back without a second slide. */
export function registerTripBase(tripId: string, listener: Listener) {
  const list = bases.get(tripId) ?? [];
  bases.set(tripId, [...list, listener]);
  return () => { const next = (bases.get(tripId) ?? []).filter(l => l !== listener); if (next.length) bases.set(tripId, next); else bases.delete(tripId); };
}
export function sendToTripBase(tripId: string, to: MobileTarget) {
  const list = bases.get(tripId);
  if (!list?.length) return false;
  list[list.length - 1](to);
  return true;
}

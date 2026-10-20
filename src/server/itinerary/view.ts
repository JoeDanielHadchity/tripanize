import { effectiveStop, isAnchored, type StopWithRefs } from "./service";

export type StopView = {
  id: string; version: number; dayId: string | null; plan: string; position: number;
  title: string; category: string; locationName: string | null; address: string | null; lat: number | null; lng: number | null;
  reason: string | null; startTime: string | null; durationMin: number | null; travelToNextMin: number | null; travelMode: string | null; travelNote: string | null;
  officialUrl: string | null; sourceUrls: string[]; estCostMinor: number | null; currency: string | null;
  bookingRequired: boolean; bookingNote: string | null; hoursNote: string | null; notes: string | null;
  status: string; isFixed: boolean; isMeal: boolean; isFreeTime: boolean; indoor: boolean | null; origin: string; anchored: boolean;
  booking: { id: string; status: string; category: string; version: number } | null;
  eventId: string | null;
};

export function toStopView(s: StopWithRefs): StopView {
  const e = effectiveStop(s);
  return {
    id: s.id, version: s.version, dayId: s.dayId, plan: s.plan, position: s.position,
    title: e.title, category: s.category, locationName: s.locationName, address: e.address, lat: s.lat, lng: s.lng,
    reason: s.reason, startTime: e.startTime, durationMin: e.durationMin, travelToNextMin: s.travelToNextMin, travelMode: s.travelMode, travelNote: s.travelNote,
    officialUrl: e.officialUrl, sourceUrls: s.sourceUrls, estCostMinor: e.estCostMinor, currency: e.currency,
    bookingRequired: s.bookingRequired, bookingNote: s.bookingNote, hoursNote: s.hoursNote, notes: s.notes,
    status: e.status, isFixed: s.isFixed, isMeal: s.isMeal, isFreeTime: s.isFreeTime, indoor: s.indoor, origin: s.origin, anchored: isAnchored(s),
    booking: s.booking ? { id: s.booking.id, status: s.booking.status, category: s.booking.category, version: s.booking.version } : null,
    eventId: s.eventId,
  };
}

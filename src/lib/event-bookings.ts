export type SuggestedEventBooking = {
  id: string; title: string; category: string; date: string | null; endDate: string | null; startTime: string | null; dateVerified: boolean;
  venue: string | null; city: string | null; address: string | null; officialUrl: string | null; bookingUrl: string | null;
  priceText: string | null; availability: string | null; bookingDeadline: string | null; cancelled: boolean; soldOut: boolean;
  scheduledDate: string | null; scheduledTime: string | null; durationMin: number | null;
};

/** A multi-day event's opening date is not necessarily the traveler's visit. */
export function suggestedBookingDate(event: Pick<SuggestedEventBooking, "date" | "endDate" | "scheduledDate">, trip: { start: string | null; end: string | null }) {
  const date = event.scheduledDate ?? event.date;
  if (!date || (trip.end && date > trip.end)) return null;
  if (trip.start && date < trip.start) return event.endDate && event.endDate >= trip.start ? trip.start : null;
  return date;
}

export type SuggestedEventBooking = {
  id: string; title: string; category: string; date: string | null; endDate: string | null; startTime: string | null; dateVerified: boolean;
  venue: string | null; city: string | null; address: string | null; officialUrl: string | null; bookingUrl: string | null;
  priceText: string | null; availability: string | null; bookingDeadline: string | null; cancelled: boolean; soldOut: boolean;
  scheduledDate: string | null; scheduledTime: string | null; durationMin: number | null;
};

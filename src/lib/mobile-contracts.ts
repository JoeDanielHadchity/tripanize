/** JSON-only contracts shared by the native client and the existing backend. */
export type MobileUser = { id: string; name: string; email: string };
export type MobileTripCard = {
  id: string; name: string; role: "OWNER" | "COLLABORATOR" | "VIEWER";
  startDate: string | null; endDate: string | null; destinations: string[]; travelers: string[];
  phase: "current" | "upcoming" | "undated" | "past"; onboardingStage: string;
  premium: boolean; image: { url: string; credit: string; pageUrl: string | null } | null;
};
export type MobileStop = {
  id: string; title: string; category: string; startTime: string | null; durationMin: number | null;
  address: string | null; reason: string | null; notes: string | null; status: string;
  estCostMinor: number | null; currency: string | null; officialUrl: string | null;
  bookingRequired: boolean; bookingStatus: string | null; lat: number | null; lng: number | null;
};
export type MobileRestaurant = { name: string; cuisine: string; area: string; whyFits: string; officialUrl: string | null; sourceUrls: string[] };
export type MobileDay = {
  id: string; date: string; title: string | null; area: string | null; notes: string | null;
  destination: string | null; activePlan: string; stops: MobileStop[];
  meals: { breakfast: MobileRestaurant[]; lunch: MobileRestaurant[]; dinner: MobileRestaurant[] };
};
export type MobileItinerary = {
  trip: MobileTripCard; timezone: string; today: string; canEdit: boolean; days: MobileDay[]; ideas: MobileStop[];
};
export type MobileDestinationSearch = {
  id: string; number: number; status: string; selectedTripId: string | null;
  ideas: { destination: string; country: string; whyFits: string; bestTime: string; weather: string }[];
};

export const INTERESTS = ["Art & museums", "History", "Architecture", "Food & markets", "Nature & parks", "Hiking", "Beaches", "Nightlife", "Music", "Shopping", "Local culture", "Photography", "Wine & beer", "Family-friendly", "Wellness", "Sports"] as const;

export const TRANSPORT = ["Walking", "Public transit", "Taxi / rideshare", "Rental car", "Own car", "Train", "Bike", "Domestic flights"] as const;

export const STOP_CATEGORIES = ["sight", "museum", "food", "cafe", "nature", "shopping", "activity", "nightlife", "transport", "accommodation", "rest", "event", "other"] as const;

export const EXPENSE_CATEGORIES = ["Accommodation", "Food & drink", "Transport", "Activities", "Shopping", "Groceries", "Fees", "Other"] as const;

export const BOOKING_CATEGORIES = [
  ["ACCOMMODATION", "Accommodation"],
  ["FLIGHT", "Flight"],
  ["TRAIN", "Train"],
  ["TRANSPORT", "Other transport"],
  ["CAR_RENTAL", "Car rental"],
  ["ATTRACTION", "Attraction"],
  ["RESTAURANT", "Restaurant"],
  ["EXPERIENCE", "Experience"],
  ["OTHER", "Other"],
] as const;

export const BOOKING_STATUSES = [
  ["IDEA", "Idea"],
  ["TO_BOOK", "To book"],
  ["REQUESTED", "Requested"],
  ["BOOKED", "Booked"],
  ["PAID", "Paid"],
  ["CANCELLED", "Cancelled"],
] as const;

export const PACKING_CATEGORIES = ["Clothing", "Toiletries", "Health", "Documents", "Tech", "Gear", "Kids", "Car", "Misc"] as const;

export const NOTIFY_CHANGE_TYPES = [
  ["new", "New matching events"],
  ["date", "Date or time changes"],
  ["venue", "Venue changes"],
  ["cancelled", "Cancellations"],
  ["sold_out", "Sold out"],
  ["booking_open", "Booking opens"],
  ["price", "Price or availability changes"],
] as const;

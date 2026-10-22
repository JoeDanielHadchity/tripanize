import { describe, expect, it } from "vitest";
import { suggestedBookingDate } from "@/lib/event-bookings";

const trip = { start: "2026-11-13", end: "2026-11-29" };
describe("suggested event visit dates", () => {
  it("uses a visit during the trip for an exhibition that opened earlier", () => {
    expect(suggestedBookingDate({ date: "2026-10-04", endDate: "2027-01-31", scheduledDate: null }, trip)).toBe("2026-11-13");
  });
  it("keeps an explicitly scheduled visit and a performance date during the trip", () => {
    expect(suggestedBookingDate({ date: "2026-10-04", endDate: "2027-01-31", scheduledDate: "2026-11-18" }, trip)).toBe("2026-11-18");
    expect(suggestedBookingDate({ date: "2026-11-27", endDate: null, scheduledDate: null }, trip)).toBe("2026-11-27");
  });
  it("leaves unknown or non-overlapping dates for the traveler to choose", () => {
    for (const event of [{ date: null, endDate: null }, { date: "2026-10-04", endDate: "2026-11-01" }, { date: "2026-12-01", endDate: null }]) {
      expect(suggestedBookingDate({ ...event, scheduledDate: null }, trip)).toBeNull();
    }
  });
});

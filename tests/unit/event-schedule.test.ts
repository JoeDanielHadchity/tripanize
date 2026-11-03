import { expect, it } from "vitest";
import { automaticSearchDay, discoveryCadence, nextDiscoveryAt } from "@/server/events/schedule";
import { addDays } from "@/lib/dates";
const now = (s: string) => new Date(s);
// 2030-06-15 is a Saturday; Mondays before it: May 13, 20, 27, June 3, 10.
const trip = { startDate: "2030-06-15", endDate: "2030-06-20", timezone: "UTC" };
it("searches weekly on Mondays, then every 3 days in the last two weeks, and never during the trip", () => {
  expect(discoveryCadence(trip, now("2030-05-31T12:00Z"))).toBe("Weekly · Mondays");
  expect(discoveryCadence(trip, now("2030-06-01T12:00Z"))).toBe("Every 3 days until the trip starts");
  expect(discoveryCadence(trip, now("2030-06-15T12:00Z"))).toMatch(/^Paused during the trip/);
  expect(nextDiscoveryAt(trip, now("2030-05-06T10:00Z"))?.toISOString()).toBe("2030-05-13T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-05-20T10:00Z"))?.toISOString()).toBe("2030-05-27T09:00:00.000Z");
  // 14, 11, 8, 5 and 2 days before departure.
  expect(nextDiscoveryAt(trip, now("2030-05-28T10:00Z"))?.toISOString()).toBe("2030-06-01T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-01T10:00Z"))?.toISOString()).toBe("2030-06-04T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-10T10:00Z"))?.toISOString()).toBe("2030-06-13T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-13T10:00Z"))).toBeNull();
});
it("runs about 11 automatic searches for a week-long trip booked 60 days ahead, instead of about 29", () => {
  let count = 0;
  for (let d = addDays(trip.startDate, -60); d <= trip.endDate; d = addDays(d, 1)) if (automaticSearchDay(d, trip.startDate)) count++;
  expect(count).toBe(11);
  let fromSixWeeks = 0;
  for (let d = addDays(trip.startDate, -42); d <= trip.endDate; d = addDays(d, 1)) if (automaticSearchDay(d, trip.startDate)) fromSixWeeks++;
  expect(fromSixWeeks).toBe(9);
});
it("uses the trip's calendar and daylight-saving offset rather than server weekdays", () => {
  const ny = { startDate: "2030-04-15", endDate: "2030-04-20", timezone: "America/New_York" };
  expect(nextDiscoveryAt(ny, now("2030-03-09T16:00Z"))?.toISOString()).toBe("2030-03-11T13:00:00.000Z");
  const tokyo = { ...ny, timezone: "Asia/Tokyo" };
  expect(nextDiscoveryAt(tokyo, now("2030-03-10T23:30Z"))?.toISOString()).toBe("2030-03-11T00:00:00.000Z");
});
it("doesn't search once the trip has started, after it ends, or without dates", () => {
  expect(nextDiscoveryAt(trip, now("2030-06-15T10:00Z"))).toBeNull();
  expect(nextDiscoveryAt(trip, now("2030-06-20T10:00Z"))).toBeNull();
  expect(nextDiscoveryAt({ ...trip, startDate: null }, now("2030-05-01T00:00Z"))).toBeNull();
  expect(discoveryCadence(trip, now("2030-06-21T00:00Z"))).toMatch(/stopped/);
});

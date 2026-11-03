import { expect, it } from "vitest";
import { automaticSearchDay, discoveryCadence, nextDiscoveryAt, MAX_AUTOMATIC_CHECKS } from "@/server/events/schedule";
import { addDays } from "@/lib/dates";
const now = (s: string) => new Date(s);
// The trip starts on 2030-06-15; 45 days before is 2030-05-01.
const trip = { startDate: "2030-06-15", endDate: "2030-06-20", timezone: "UTC" };
it("checks 45, 30, 21, 14, 10, 7, 5, 3 and 1 days before, and on the first morning", () => {
  expect(nextDiscoveryAt(trip, now("2030-03-01T10:00Z"))?.toISOString()).toBe("2030-05-01T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-05-01T10:00Z"))?.toISOString()).toBe("2030-05-16T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-05-16T10:00Z"))?.toISOString()).toBe("2030-05-25T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-05-25T10:00Z"))?.toISOString()).toBe("2030-06-01T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-01T10:00Z"))?.toISOString()).toBe("2030-06-05T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-05T10:00Z"))?.toISOString()).toBe("2030-06-08T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-08T10:00Z"))?.toISOString()).toBe("2030-06-10T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-10T10:00Z"))?.toISOString()).toBe("2030-06-12T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-12T10:00Z"))?.toISOString()).toBe("2030-06-14T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-14T10:00Z"))?.toISOString()).toBe("2030-06-15T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-15T10:00Z"))).toBeNull();
});
it("never runs more than 10 checks, and a late booking only gets the ones still ahead", () => {
  let count = 0;
  for (let d = addDays(trip.startDate, -120); d <= trip.endDate; d = addDays(d, 1)) if (automaticSearchDay(d, trip.startDate)) count++;
  expect(count).toBe(MAX_AUTOMATIC_CHECKS);
  expect(MAX_AUTOMATIC_CHECKS).toBe(10);
  let late = 0;
  for (let d = addDays(trip.startDate, -12); d <= trip.endDate; d = addDays(d, 1)) if (automaticSearchDay(d, trip.startDate)) late++;
  expect(late).toBe(6);
});
it("says when checks start, while they run, and when they're done", () => {
  expect(discoveryCadence(trip, now("2030-04-01T12:00Z"))).toBe("Automatic checks start 45 days before the trip");
  expect(discoveryCadence(trip, now("2030-05-20T12:00Z"))).toBe("Up to 10 automatic checks before the trip");
  expect(discoveryCadence(trip, now("2030-06-15T12:00Z"))).toBe("Last automatic check this morning");
  expect(discoveryCadence(trip, now("2030-06-16T12:00Z"))).toMatch(/^Automatic checks finished/);
  expect(discoveryCadence(trip, now("2030-06-21T00:00Z"))).toMatch(/stopped/);
});
it("uses the trip's calendar and daylight-saving offset", () => {
  const ny = { startDate: "2030-04-15", endDate: "2030-04-20", timezone: "America/New_York" };
  // 45 days before 15 April is 1 March (EST, UTC-5).
  expect(nextDiscoveryAt(ny, now("2030-02-20T16:00Z"))?.toISOString()).toBe("2030-03-01T14:00:00.000Z");
  const tokyo = { ...ny, timezone: "Asia/Tokyo" };
  expect(nextDiscoveryAt(tokyo, now("2030-02-28T23:30Z"))?.toISOString()).toBe("2030-03-01T00:00:00.000Z");
});
it("doesn't check after the first morning, after the trip ends, or without dates", () => {
  expect(nextDiscoveryAt(trip, now("2030-06-16T10:00Z"))).toBeNull();
  expect(nextDiscoveryAt(trip, now("2030-06-20T10:00Z"))).toBeNull();
  expect(nextDiscoveryAt({ ...trip, startDate: null }, now("2030-05-01T00:00Z"))).toBeNull();
});

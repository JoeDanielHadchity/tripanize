import { expect, it } from "vitest";
import { discoveryCadence, nextDiscoveryAt } from "@/server/events/schedule";
const now = (s: string) => new Date(s);
it("uses weekly Mondays at 30+ days, Mondays/Thursdays at 15–29 days, daily at 14 or fewer", () => {
  const trip = { startDate: "2030-06-15", endDate: "2030-06-20", timezone: "UTC" };
  expect(discoveryCadence(trip, now("2030-05-16T12:00Z"))).toBe("Weekly · Mondays");
  expect(discoveryCadence(trip, now("2030-05-17T12:00Z"))).toBe("Mondays & Thursdays");
  expect(discoveryCadence(trip, now("2030-06-01T12:00Z"))).toMatch(/^Daily/);
  expect(discoveryCadence(trip, now("2030-06-15T12:00Z"))).toMatch(/^Daily/);
  expect(nextDiscoveryAt(trip, now("2030-05-06T10:00Z"))?.toISOString()).toBe("2030-05-13T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-05-20T10:00Z"))?.toISOString()).toBe("2030-05-23T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-06-01T10:00Z"))?.toISOString()).toBe("2030-06-02T09:00:00.000Z");
});
it("accelerates at the boundary even if the old weekly slot would have been later", () => {
  const trip = { startDate: "2030-06-15", endDate: "2030-06-20", timezone: "UTC" };
  expect(nextDiscoveryAt(trip, now("2030-05-27T12:00Z"))?.toISOString()).toBe("2030-05-30T09:00:00.000Z");
  expect(nextDiscoveryAt(trip, now("2030-05-30T12:00Z"))?.toISOString()).toBe("2030-06-01T09:00:00.000Z");
});
it("uses the trip's calendar and daylight-saving offset rather than server weekdays", () => {
  const trip = { startDate: "2030-03-15", endDate: "2030-03-20", timezone: "America/New_York" };
  expect(nextDiscoveryAt(trip, now("2030-03-09T16:00Z"))?.toISOString()).toBe("2030-03-10T13:00:00.000Z");
  const tokyo = { ...trip, timezone: "Asia/Tokyo" };
  expect(nextDiscoveryAt(tokyo, now("2030-03-10T23:30Z"))?.toISOString()).toBe("2030-03-11T00:00:00.000Z");
});
it("doesn't search after the final day or without dates", () => {
  const trip = { startDate: "2030-06-15", endDate: "2030-06-20", timezone: "UTC" };
  expect(nextDiscoveryAt(trip, now("2030-06-20T10:00Z"))).toBeNull();
  expect(nextDiscoveryAt({ ...trip, startDate: null }, now("2030-05-01T00:00Z"))).toBeNull();
  expect(discoveryCadence(trip, now("2030-06-21T00:00Z"))).toMatch(/stopped/);
});

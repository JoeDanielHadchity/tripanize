import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { copyExample } from "@/server/examples/copy";
import { CITY_GUIDES } from "@/server/examples/city-guides";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { getTripPlan, requirePremiumAccess } from "@/server/plans/access";
import { requireTrip } from "@/server/auth/permissions";
import { makeUser, resetDb } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); });
afterEach(() => setTestRuntime(runtime));

describe("city guide copies", () => {
  it.each(CITY_GUIDES)("creates a private, editable $city trip with its own dates and currency", async guide => {
    const owner = await makeUser("Guide traveler");
    const stranger = await makeUser("Another traveler");
    const id = await copyExample(owner.id, guide.slug, "2030-07-10");
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id }, include: { destinations: true, days: { orderBy: { date: "asc" }, include: { stops: { orderBy: { position: "asc" } } } }, bookings: true } });
    expect(trip).toMatchObject({ ownerId: owner.id, copiedFromExample: guide.slug, timezone: guide.timezone, currency: guide.currency, startDate: "2030-07-10", endDate: "2030-07-13", budgetMinor: null });
    expect(trip.destinations).toMatchObject([{ name: guide.city, arriveDate: "2030-07-10", departDate: "2030-07-13" }]);
    expect(trip.days.map(day => day.date)).toEqual(["2030-07-10", "2030-07-11", "2030-07-12", "2030-07-13"]);
    for (const [index, day] of trip.days.entries()) {
      expect(day.title).toBe(guide.days[index].title);
      expect(day.notes).toContain(guide.days[index].planB);
      expect(day.stops.map(stop => stop.title)).toEqual(guide.days[index].stops.map(stop => stop.title));
      expect(day.stops.every(stop => stop.origin === "MANUAL" && stop.currency === guide.currency && stop.estCostMinor === null && stop.bookingId === null)).toBe(true);
      expect(day.stops.every(stop => stop.notes?.includes("suggested duration"))).toBe(true);
    }
    expect(trip.bookings).toHaveLength(guide.bookings.length);
    expect(trip.bookings.every(booking => booking.status === "IDEA" && booking.date === null && booking.estCostMinor === null && booking.finalCostMinor === null)).toBe(true);
    expect((await requireTrip(id, owner.id, "edit")).role).toBe("OWNER");
    await expect(requireTrip(id, stranger.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getTripPlan(id)).premium).toBe(false);
    await expect(requirePremiumAccess(id, "expenses")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.premiumCheckout.count({ where: { tripId: id } })).toBe(0);
    expect(await prisma.expense.count({ where: { tripId: id } })).toBe(0);
  });

  it("preserves the original Lisbon–Porto example's group budget and time zone", async () => {
    const owner = await makeUser("Original example traveler");
    const id = await copyExample(owner.id, "lisbon-porto", "2030-07-10");
    expect(await prisma.trip.findUniqueOrThrow({ where: { id } })).toMatchObject({ timezone: "Europe/Lisbon", currency: "EUR", budgetMinor: 180000, startDate: "2030-07-10", endDate: "2030-07-15" });
  });

  it("rejects missing guides and invalid calendar dates before creating a trip", async () => {
    const owner = await makeUser("Invalid copy traveler");
    await expect(copyExample(owner.id, "not-a-guide", "2030-07-10")).rejects.toMatchObject({ code: "NOT_FOUND" });
    for (const date of ["not-a-date", "2027-02-30"]) await expect(copyExample(owner.id, "paris", date)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.trip.count()).toBe(0);
  });
});

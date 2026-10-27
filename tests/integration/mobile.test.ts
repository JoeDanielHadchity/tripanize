import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { getMobileDestinations, getMobileItinerary, getMobileTrips, getMobileUser } from "@/server/mobile/service";
import { mobileRead } from "@/server/mobile/api";
import { addStop } from "@/server/itinerary/service";
import { makeTrip, makeUser, resetDb } from "./helpers";
import { fixtureIdeas } from "../fixtures/destinations";
import { DISCOVERY_DEFAULTS } from "@/server/destinations/schema";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); });
afterEach(() => setTestRuntime(runtime));

it("requires a real session and marks error responses private", async () => {
  for (const headers of [new Headers(), new Headers({ Cookie: "better-auth.session_token=forged" })]) {
    const response = await mobileRead(new Request("http://localhost/api/mobile/trips", { headers }), getMobileTrips);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).not.toHaveProperty("trips");
  }
});

it("returns only member trips and preserves roles and real Premium access", async () => {
  const owner = await makeUser("Owner"), viewer = await makeUser("Viewer"), stranger = await makeUser("Stranger");
  const visible = await makeTrip(owner.id), hidden = await makeTrip(stranger.id);
  await prisma.tripMembership.create({ data: { tripId: visible, userId: viewer.id, role: "VIEWER" } });
  expect((await getMobileTrips(viewer.id)).trips).toMatchObject([{ id: visible, role: "VIEWER", premium: false }]);
  expect((await getMobileTrips(owner.id)).trips.map(t => t.id)).not.toContain(hidden);
  expect((await getMobileItinerary(viewer.id, visible)).canEdit).toBe(false);
  expect((await getMobileItinerary(owner.id, visible)).canEdit).toBe(true);
  await expect(getMobileItinerary(stranger.id, visible)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await prisma.trialInvitation.create({ data: { tripId: visible, email: owner.email, emailText: "Isolated mobile trial fixture", tokenHash: "mobile-trial", createdById: owner.id, acceptedById: owner.id, acceptedAt: new Date(), expiresAt: new Date(Date.now() + 86400_000), trialEndsAt: new Date(Date.now() + 86400_000) } });
  expect((await getMobileTrips(viewer.id)).trips[0].premium).toBe(true);
  await prisma.trialInvitation.update({ where: { tripId: visible }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
  expect((await getMobileTrips(viewer.id)).trips[0].premium).toBe(false);
});

it("returns each day separately with only its active, non-skipped stops", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id);
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  await addStop(owner.id, tripId, { dayId: days[0].id, input: { title: "Plan A sight" } });
  await addStop(owner.id, tripId, { dayId: days[0].id, plan: "B", input: { title: "Plan B museum" } });
  const skipped = await addStop(owner.id, tripId, { dayId: days[0].id, plan: "B", input: { title: "Skipped sight" } });
  await prisma.stop.update({ where: { id: skipped.id }, data: { status: "SKIPPED" } });
  await prisma.itineraryDay.update({ where: { id: days[0].id }, data: { activePlan: "B" } });
  await addStop(owner.id, tripId, { dayId: days[1].id, input: { title: "Another day's walk" } });
  const result = await getMobileItinerary(owner.id, tripId);
  expect(result.days).toHaveLength(4);
  expect(result.days[0].stops.map(s => s.title)).toEqual(["Plan B museum"]);
  expect(result.days[1].stops.map(s => s.title)).toEqual(["Another day's walk"]);
  expect(JSON.parse(JSON.stringify(result))).toMatchObject({ trip: { id: tripId, role: "OWNER" }, timezone: "Europe/Lisbon" });
});

it("keeps destination research private and does not start new AI work", async () => {
  const owner = await makeUser("Owner"), other = await makeUser("Other");
  await prisma.destinationSearch.create({ data: { userId: owner.id, number: 1, status: "SUCCEEDED", input: DISCOVERY_DEFAULTS, result: fixtureIdeas() } });
  const before = await prisma.destinationSearch.count();
  expect((await getMobileDestinations(owner.id)).searches[0].ideas).toHaveLength(5);
  expect((await getMobileDestinations(other.id)).searches).toEqual([]);
  expect(await prisma.destinationSearch.count()).toBe(before);
});

it("blocks suspended accounts even when a prior session exists", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id);
  await prisma.user.update({ where: { id: owner.id }, data: { suspendedAt: new Date() } });
  await expect(getMobileUser(owner.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(getMobileTrips(owner.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(getMobileItinerary(owner.id, tripId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});

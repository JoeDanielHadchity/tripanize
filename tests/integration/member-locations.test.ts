import { beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { changeMemberLocation, getLocationSelf, getMemberLocations } from "@/server/locations/service";
import { removeMember } from "@/server/invitations/service";
import { exportTripJson } from "@/server/export";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
const token = "isolated-location-lease-01234567890123456789";
const otherToken = "different-location-lease-0123456789012345678";
const point = () => ({ lat: 12.345678, lng: -45.678912, accuracy: 15, capturedAt: new Date(Date.now() - 1000).toISOString() });
async function fixture() {
  const owner = await makeUser("Ana");
  const viewer = await makeUser("Ben");
  const outsider = await makeUser("Eve");
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  return { owner, viewer, outsider, tripId };
}

it("starts off for everyone; viewers can opt into their own sharing and current members can read it", async () => {
  const f = await fixture();
  expect((await getMemberLocations(f.owner.id, f.tripId)).locations).toEqual([]);
  expect(await getLocationSelf(f.viewer.id, f.tripId)).toMatchObject({ version: 0, sessionId: null });
  const self = await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: 0, ...point() });
  expect(self.sessionId).toBeTruthy();
  const data = await getMemberLocations(f.owner.id, f.tripId);
  expect(data.locations).toHaveLength(1);
  expect(data.locations[0]).toMatchObject({ userId: f.viewer.id, lat: 12.345678, accuracy: 15 });
  expect(data.self.sessionId).toBeNull();
  expect(JSON.stringify(data)).not.toMatch(/leaseHash|isolated-location-lease|membershipId/);
  await expect(getMemberLocations(f.outsider.id, f.tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(changeMemberLocation(f.outsider.id, f.tripId, { op: "stop" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("clears coordinates immediately on stop, and late requests cannot restart sharing", async () => {
  const f = await fixture();
  const before = await getLocationSelf(f.viewer.id, f.tripId);
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: before.version, ...point() });
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "stop" });
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...point(), capturedAt: new Date().toISOString() })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: before.version, ...point() })).rejects.toMatchObject({ code: "CONFLICT" });
  const row = await prisma.memberLocation.findFirstOrThrow();
  expect(row).toMatchObject({ lat: null, lng: null, accuracy: null, capturedAt: null, expiresAt: null, leaseHash: null });
  expect((await getMemberLocations(f.owner.id, f.tripId)).locations).toEqual([]);
});

it("stop before an in-flight initial start invalidates the start even if no row existed", async () => {
  const f = await fixture();
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "stop", token });
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: 0, ...point() })).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await getMemberLocations(f.owner.id, f.tripId)).locations).toEqual([]);
});

it("another tab can stop sharing, while a departed old tab cannot clear a newer device's point", async () => {
  const f = await fixture();
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: 0, ...point() });
  const status = await getLocationSelf(f.viewer.id, f.tripId);
  const newSession = await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token: otherToken, expectedVersion: status.version, ...point() });
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "stop", token });
  expect((await getLocationSelf(f.viewer.id, f.tripId)).sessionId).toBe(newSession.sessionId);
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...point() })).rejects.toMatchObject({ code: "CONFLICT" });
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "stop" });
  expect((await getLocationSelf(f.viewer.id, f.tripId)).sessionId).toBeNull();
});

it("expires stale points, deletes coordinates and requires fresh consent instead of an old lease", async () => {
  const f = await fixture();
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: 0, ...point() });
  await prisma.memberLocation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await getMemberLocations(f.owner.id, f.tripId)).locations).toEqual([]);
  expect(await prisma.memberLocation.findFirstOrThrow()).toMatchObject({ lat: null, lng: null, leaseHash: null, expiresAt: null });
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...point() })).rejects.toMatchObject({ code: "CONFLICT" });
});

it("keeps one latest position, rejects stale or invalid data, and prevents changing another member", async () => {
  const f = await fixture();
  const initialPoint = point();
  const started = await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: 0, ...initialPoint });
  const duplicate = await changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...initialPoint });
  expect(duplicate.expiresAt).toBe(started.expiresAt);
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...point(), lat: 13, capturedAt: new Date().toISOString() });
  expect(await prisma.memberLocation.count()).toBe(1);
  expect((await getMemberLocations(f.owner.id, f.tripId)).locations[0].lat).toBe(13);
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...point() })).rejects.toMatchObject({ code: "CONFLICT" });
  for (const patch of [{ lat: 91 }, { lng: -181 }, { accuracy: -5 }, { lat: NaN }, { capturedAt: "not-a-date" }, { capturedAt: new Date(Date.now() - 120000).toISOString() }, { userId: f.owner.id }]) {
    await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...point(), ...patch })).rejects.toMatchObject({ code: "VALIDATION" });
  }
  // Owning the trip gives no ability to update another member's lease.
  await expect(changeMemberLocation(f.owner.id, f.tripId, { op: "update", token, ...point() })).rejects.toMatchObject({ code: "CONFLICT" });
});

it("removing membership deletes its point, prevents reads and updates, and rejoining starts off", async () => {
  const f = await fixture();
  const oldScope = (await getLocationSelf(f.viewer.id, f.tripId)).scope;
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: 0, ...point() });
  await removeMember(f.owner.id, f.tripId, f.viewer.id);
  expect(await prisma.memberLocation.count()).toBe(0);
  await expect(getMemberLocations(f.viewer.id, f.tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "update", token, ...point() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await prisma.tripMembership.create({ data: { tripId: f.tripId, userId: f.viewer.id, role: "VIEWER" } });
  expect((await getLocationSelf(f.viewer.id, f.tripId)).sessionId).toBeNull();
  await expect(changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: oldScope, token, expectedVersion: 0, ...point() })).rejects.toMatchObject({ code: "CONFLICT" });
});

it("keeps location and tokens out of trip exports, audit logs, notifications and the trip revision", async () => {
  const f = await fixture();
  const revision = (await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).revision;
  const audits = await prisma.auditLog.count();
  await changeMemberLocation(f.viewer.id, f.tripId, { op: "start", scope: (await getLocationSelf(f.viewer.id, f.tripId)).scope, token, expectedVersion: 0, ...point() });
  expect(await prisma.auditLog.count()).toBe(audits);
  expect(await prisma.tripNotification.count()).toBe(0);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).revision).toBe(revision);
  expect(JSON.stringify(await exportTripJson(f.owner.id, f.tripId))).not.toMatch(/12\.345678|45\.678912|leaseHash|MemberLocation|isolated-location-lease/);
});

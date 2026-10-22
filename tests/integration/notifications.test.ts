import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { recordChange } from "@/server/audit";
import { addPackingItem, updatePackingItem, removePackingItem } from "@/server/packing/service";
import { addTraveler, removeMember, renameTraveler } from "@/server/invitations/service";
import { listChangeNotifications, markChangeNotificationsRead, sendNextChangeEmail, setChangeEmailPreference } from "@/server/notifications/changes";
import { sendEmail } from "@/server/notifications/email";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function fixture() {
  const owner = await makeUser("Ana");
  const member = await makeUser("Ben");
  const viewer = await makeUser("Cara");
  const outsider = await makeUser("Outside");
  await prisma.user.update({ where: { id: member.id }, data: { emailVerified: true } });
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  vi.stubEnv("RESEND_API_KEY", "isolated-not-a-real-key");
  await setChangeEmailPreference(member.id, tripId, true);
  return { owner, member, viewer, outsider, tripId };
}

it("creates one inbox item per other current member, with email opt-in and no private audit payload", async () => {
  const f = await fixture();
  await prisma.$transaction(tx => recordChange(tx, { tripId: f.tripId, actorId: f.owner.id, entity: "expense", entityId: "expense-fixture", action: "create", after: { description: "Private payment details", confirmation: "secret" } }));
  const notices = await prisma.tripNotification.findMany();
  expect(notices).toHaveLength(2);
  expect(notices.map(n => n.userId).sort()).toEqual([f.member.id, f.viewer.id].sort());
  const email = notices.find(n => n.userId === f.member.id)!;
  expect(email).toMatchObject({ emailStatus: "queued", summary: "Ana added an expense.", href: `/trips/${f.tripId}/expenses` });
  expect(email.emailText).not.toMatch(/Private payment|secret/);
  expect(notices.find(n => n.userId === f.viewer.id)!.emailStatus).toBe("disabled");
  expect((await listChangeNotifications(f.owner.id)).unread).toBe(0);
  expect((await listChangeNotifications(f.outsider.id)).items).toHaveLength(0);
});

it("rolls back notifications together with failed shared edits", async () => {
  const f = await fixture();
  const before = await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } });
  await expect(prisma.$transaction(async tx => {
    await recordChange(tx, { tripId: f.tripId, actorId: f.owner.id, entity: "trip", entityId: f.tripId, action: "update" });
    throw new Error("reject edit");
  })).rejects.toThrow("reject edit");
  expect(await prisma.tripNotification.count()).toBe(0);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).revision).toBe(before.revision);
});

it("keeps personal packing silent and records shared create, update, delete and restored suggestions", async () => {
  const f = await fixture();
  const personal = await addPackingItem(f.owner.id, f.tripId, { label: "Medication", category: "Misc", shared: false });
  await updatePackingItem(f.owner.id, f.tripId, personal.id, { packed: true }, personal.version);
  await removePackingItem(f.owner.id, f.tripId, personal.id);
  expect(await prisma.tripNotification.count()).toBe(0);
  const shared = await addPackingItem(f.owner.id, f.tripId, { label: "Adapter", category: "Misc", shared: true });
  await updatePackingItem(f.owner.id, f.tripId, shared.id, { packed: true }, shared.version);
  await prisma.packingItem.update({ where: { id: shared.id }, data: { source: "suggested" } });
  await removePackingItem(f.owner.id, f.tripId, shared.id);
  await addPackingItem(f.owner.id, f.tripId, { label: "Adapter", category: "Misc", shared: true });
  expect((await listChangeNotifications(f.member.id)).unread).toBe(4);
});

it("records traveler edits, keeps read state per user and denies others' preferences", async () => {
  const f = await fixture();
  const traveler = await addTraveler(f.owner.id, f.tripId, "Dan");
  await renameTraveler(f.owner.id, f.tripId, traveler.id, "Daniel");
  const inbox = await listChangeNotifications(f.member.id);
  expect(inbox.unread).toBe(2);
  await markChangeNotificationsRead(f.outsider.id, { id: inbox.items[0].id });
  expect((await listChangeNotifications(f.member.id)).unread).toBe(2);
  await markChangeNotificationsRead(f.member.id, { id: inbox.items[0].id });
  expect((await listChangeNotifications(f.member.id)).unread).toBe(1);
  expect((await listChangeNotifications(f.viewer.id)).unread).toBe(2);
  await markChangeNotificationsRead(f.member.id, { before: new Date().toISOString() });
  expect((await listChangeNotifications(f.member.id)).unread).toBe(0);
  await expect(setChangeEmailPreference(f.outsider.id, f.tripId, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(setChangeEmailPreference(f.viewer.id, f.tripId, true)).rejects.toMatchObject({ code: "VALIDATION" });
});

it("paginates tied timestamps without skipping or repeating updates", async () => {
  const f = await fixture();
  const now = new Date();
  await prisma.$transaction(async tx => {
    for (let i = 0; i < 32; i++) await recordChange(tx, { tripId: f.tripId, actorId: f.owner.id, entity: "task", entityId: `task-${i}`, action: "create" });
  }, { timeout: 20000 });
  await prisma.tripNotification.updateMany({ data: { createdAt: now } });
  const first = await listChangeNotifications(f.member.id);
  const next = await listChangeNotifications(f.member.id, first.nextCursor!);
  expect(first.items).toHaveLength(30);
  expect(next.items).toHaveLength(2);
  expect(new Set([...first.items, ...next.items].map(n => n.id)).size).toBe(32);
  await expect(listChangeNotifications(f.outsider.id, first.nextCursor!)).rejects.toMatchObject({ code: "VALIDATION" });
});

it("retries transient errors with the same immutable payload and idempotency key, then sends once", async () => {
  const f = await fixture();
  await addTraveler(f.owner.id, f.tripId, "Dan");
  const send = vi.fn().mockResolvedValueOnce({ status: "failed", error: "Rate limited", retryable: true, retryAfterMs: 60000 }).mockResolvedValue({ status: "sent", providerId: "provider-fixture" });
  await sendNextChangeEmail(send);
  let n = await prisma.tripNotification.findFirstOrThrow({ where: { userId: f.member.id } });
  expect(n).toMatchObject({ emailStatus: "queued", attempts: 1 });
  expect(n.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 55000);
  await sendNextChangeEmail(send);
  expect(send).toHaveBeenCalledTimes(1);
  await prisma.tripNotification.update({ where: { id: n.id }, data: { nextAttemptAt: new Date(0) } });
  await prisma.trip.update({ where: { id: f.tripId }, data: { name: "Renamed later" } });
  await sendNextChangeEmail(send);
  expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  expect(send.mock.calls[1][0].idempotencyKey).toBe(`trip-change/${n.id}`);
  n = await prisma.tripNotification.findUniqueOrThrow({ where: { id: n.id } });
  expect(n).toMatchObject({ emailStatus: "sent", attempts: 2, providerId: "provider-fixture", nextAttemptAt: null });
  await sendNextChangeEmail(send);
  expect(send).toHaveBeenCalledTimes(2);
});

it("stops permanent failures, expired retries, opt-outs and messages to changed email addresses", async () => {
  const f = await fixture();
  const send = vi.fn().mockResolvedValue({ status: "failed", error: "Invalid address", retryable: false });
  await addTraveler(f.owner.id, f.tripId, "Dan");
  await sendNextChangeEmail(send);
  expect(await prisma.tripNotification.count({ where: { emailStatus: "failed" } })).toBe(1);
  await addTraveler(f.owner.id, f.tripId, "Eva");
  await prisma.tripNotification.updateMany({ where: { emailStatus: "queued" }, data: { firstAttemptAt: new Date(Date.now() - 21 * 3600_000) } });
  await sendNextChangeEmail(send);
  expect(send).toHaveBeenCalledTimes(1);
  await addTraveler(f.owner.id, f.tripId, "Fay");
  await setChangeEmailPreference(f.member.id, f.tripId, false);
  await sendNextChangeEmail(send);
  expect(send).toHaveBeenCalledTimes(1);
  await setChangeEmailPreference(f.member.id, f.tripId, true);
  await addTraveler(f.owner.id, f.tripId, "Guy");
  await prisma.user.update({ where: { id: f.member.id }, data: { email: "changed@example.test" } });
  await sendNextChangeEmail(send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await prisma.tripNotification.count({ where: { emailStatus: "queued" } })).toBe(0);
});

it("removes departed members' inbox and pending emails and checks membership again at delivery", async () => {
  const f = await fixture();
  await addTraveler(f.owner.id, f.tripId, "Dan");
  await removeMember(f.owner.id, f.tripId, f.member.id);
  expect((await listChangeNotifications(f.member.id)).items).toHaveLength(0);
  const send = vi.fn();
  await sendNextChangeEmail(send);
  expect(send).not.toHaveBeenCalled();
  // Even direct membership deletion cannot bypass the sender's final access check.
  await prisma.tripMembership.create({ data: { tripId: f.tripId, userId: f.member.id, role: "VIEWER" } });
  await setChangeEmailPreference(f.member.id, f.tripId, true);
  await addTraveler(f.owner.id, f.tripId, "Eva");
  await prisma.tripMembership.delete({ where: { tripId_userId: { tripId: f.tripId, userId: f.member.id } } });
  await sendNextChangeEmail(send);
  expect(send).not.toHaveBeenCalled();
});

it("passes Resend's idempotency header and classifies transient versus permanent HTTP errors", async () => {
  vi.stubEnv("RESEND_API_KEY", "isolated-not-a-real-key");
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: "Slow down" }), { status: 429, headers: { "Retry-After": "60" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Invalid address" }), { status: 422 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: "provider-test" }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const message = { to: "sink@example.test", subject: "Fixture", text: "Fixture", idempotencyKey: "trip-change/test" };
  expect(await sendEmail(message)).toMatchObject({ status: "failed", retryable: true, retryAfterMs: 60000 });
  expect(await sendEmail(message)).toMatchObject({ status: "failed", retryable: false });
  expect(await sendEmail(message)).toMatchObject({ status: "sent", providerId: "provider-test" });
  expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(message.idempotencyKey);
});

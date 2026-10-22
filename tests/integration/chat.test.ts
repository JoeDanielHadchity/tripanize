import { randomUUID } from "node:crypto";
import { beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { deleteChatMessage, getChatPage, getChatSummary, markChatRead, sendChatMessage } from "@/server/chat/service";
import { removeMember } from "@/server/invitations/service";
import { exportTripJson } from "@/server/export";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
async function fixture() {
  const owner = await makeUser("Ana");
  const viewer = await makeUser("Ben");
  const other = await makeUser("Cara");
  const outsider = await makeUser("Outside");
  const tripId = await makeTrip(owner.id);
  for (const userId of [viewer.id, other.id]) await prisma.tripMembership.create({ data: { tripId, userId, role: "VIEWER" } });
  return { owner, viewer, other, outsider, tripId };
}
const send = (userId: string, tripId: string, body: string, clientId: string = randomUUID()) => sendChatMessage(userId, tripId, { body, clientId });

it("lets current members including viewers chat; non-members cannot read, send, delete or mark read", async () => {
  const f = await fixture();
  expect((await getChatPage(f.viewer.id, f.tripId)).messages).toEqual([]);
  const message = await send(f.viewer.id, f.tripId, "  Meet at the museum?\nAt 10.  ");
  const page = await getChatPage(f.owner.id, f.tripId);
  expect(page.messages[0]).toMatchObject({ senderName: "Ben", body: "Meet at the museum?\nAt 10.", seq: 1, clientId: null });
  expect((await getChatPage(f.viewer.id, f.tripId)).messages[0].clientId).toBe(message.clientId);
  for (const operation of [() => getChatPage(f.outsider.id, f.tripId), () => getChatSummary(f.outsider.id, f.tripId), () => send(f.outsider.id, f.tripId, "No"), () => markChatRead(f.outsider.id, f.tripId, 1), () => deleteChatMessage(f.outsider.id, f.tripId, message.id)]) await expect(operation()).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("deduplicates retries transactionally and keeps one generic bell alert per unread conversation", async () => {
  const f = await fixture();
  const clientId = randomUUID();
  const message = await send(f.owner.id, f.tripId, "Sensitive chat body", clientId);
  expect(await send(f.owner.id, f.tripId, "Sensitive chat body", clientId)).toEqual(message);
  await send(f.owner.id, f.tripId, "A second message");
  expect(await prisma.chatMessage.count()).toBe(2);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).chatSeq).toBe(2);
  expect(await prisma.tripNotification.count()).toBe(2); // one for each recipient, none for the actor
  expect(await prisma.tripNotification.count({ where: { emailStatus: { not: "disabled" } } })).toBe(0);
  expect(JSON.stringify(await prisma.tripNotification.findMany())).not.toContain("Sensitive chat body");
  expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain("Sensitive chat body");
  await expect(send(f.owner.id, f.tripId, "Different text", clientId)).rejects.toMatchObject({ code: "CONFLICT" });
});

it("tracks each member's unread messages, never counts their own messages and never rewinds read markers", async () => {
  const f = await fixture();
  const a = await send(f.owner.id, f.tripId, "First");
  const b = await send(f.viewer.id, f.tripId, "Reply");
  expect((await getChatSummary(f.owner.id, f.tripId)).unread).toBe(1);
  expect((await getChatSummary(f.viewer.id, f.tripId)).unread).toBe(1);
  expect((await getChatSummary(f.other.id, f.tripId)).unread).toBe(2);
  expect((await markChatRead(f.viewer.id, f.tripId, b.seq)).unread).toBe(0);
  expect((await markChatRead(f.viewer.id, f.tripId, a.seq)).readSeq).toBe(2);
  expect(await prisma.tripNotification.count({ where: { userId: f.viewer.id, readAt: null } })).toBe(0);
  expect((await getChatSummary(f.other.id, f.tripId)).unread).toBe(2);
  await markChatRead(f.viewer.id, f.tripId, 999999);
  await send(f.owner.id, f.tripId, "New after reading");
  expect((await getChatSummary(f.viewer.id, f.tripId)).unread).toBe(1);
  expect(await prisma.tripNotification.count({ where: { userId: f.viewer.id, readAt: null } })).toBe(1);
});

it("deletes message text for everyone, syncs a tombstone and restricts moderation to author or owner", async () => {
  const f = await fixture();
  const a = await send(f.viewer.id, f.tripId, "Private message to delete");
  const before = await getChatPage(f.other.id, f.tripId);
  await expect(deleteChatMessage(f.other.id, f.tripId, a.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const removed = await deleteChatMessage(f.owner.id, f.tripId, a.id);
  expect(removed).toMatchObject({ body: "", seq: 1 });
  expect(removed.deletedAt).toBeTruthy();
  const updates = await getChatPage(f.other.id, f.tripId, { since: before.revision });
  expect(updates.messages[0]).toMatchObject({ id: a.id, body: "", deletedAt: removed.deletedAt });
  expect((await getChatSummary(f.other.id, f.tripId)).unread).toBe(0);
  expect(await prisma.tripNotification.count({ where: { readAt: null } })).toBe(0);
  expect((await prisma.chatMessage.findUniqueOrThrow({ where: { id: a.id } })).body).toBe("");
  const revision = (await getChatSummary(f.owner.id, f.tripId)).revision;
  await deleteChatMessage(f.owner.id, f.tripId, a.id);
  expect((await getChatSummary(f.owner.id, f.tripId)).revision).toBe(revision);
  expect((await send(f.viewer.id, f.tripId, "Private message to delete", a.clientId!)).deletedAt).toBeTruthy();
  expect(await prisma.chatMessage.count()).toBe(1);
});

it("paginates history and change batches in sequence even when timestamps are equal", async () => {
  const f = await fixture();
  const createdAt = new Date(Date.now() - 3600000);
  await prisma.chatMessage.createMany({ data: Array.from({ length: 125 }, (_, i) => ({ tripId: f.tripId, senderId: f.owner.id, senderName: "Ana", clientId: randomUUID(), body: `Message ${i + 1}`, seq: i + 1, revision: i + 1, createdAt })) });
  await prisma.trip.update({ where: { id: f.tripId }, data: { chatSeq: 125, chatRevision: 125 } });
  const latest = await getChatPage(f.viewer.id, f.tripId);
  expect(latest.messages.map(m => m.seq)).toEqual(Array.from({ length: 50 }, (_, i) => i + 76));
  expect(latest.hasMore).toBe(true);
  const older = await getChatPage(f.viewer.id, f.tripId, { before: 76 });
  const oldest = await getChatPage(f.viewer.id, f.tripId, { before: older.messages[0].seq });
  expect(new Set([...latest.messages, ...older.messages, ...oldest.messages].map(m => m.id)).size).toBe(125);
  expect(oldest.hasMore).toBe(false);
  const changes = await getChatPage(f.viewer.id, f.tripId, { since: 0 });
  expect(changes.messages).toHaveLength(100);
  expect(changes.revision).toBe(100);
  const rest = await getChatPage(f.viewer.id, f.tripId, { since: changes.revision });
  expect(rest.messages).toHaveLength(25);
  expect(rest.revision).toBe(125);
  const first = oldest.messages[0];
  await deleteChatMessage(f.owner.id, f.tripId, first.id);
  expect((await getChatPage(f.viewer.id, f.tripId, { since: 125 })).messages[0]).toMatchObject({ id: first.id, body: "" });
});

it("keeps trips isolated and revokes access immediately when a member leaves", async () => {
  const f = await fixture();
  const second = await makeTrip(f.owner.id, { name: "Different trip" });
  const message = await send(f.viewer.id, f.tripId, "Trip one only");
  expect((await getChatPage(f.owner.id, second)).messages).toEqual([]);
  await expect(deleteChatMessage(f.owner.id, second, message.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await removeMember(f.owner.id, f.tripId, f.viewer.id);
  await expect(getChatPage(f.viewer.id, f.tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(send(f.viewer.id, f.tripId, "Blocked")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await getChatPage(f.owner.id, f.tripId)).messages[0].body).toBe("Trip one only");
});

it("validates message length and cursors, limits rapid sending and permits safe retries at the limit", async () => {
  const f = await fixture();
  for (const body of ["  \n  ", "x".repeat(4001)]) await expect(send(f.owner.id, f.tripId, body)).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(send(f.owner.id, f.tripId, "Hello", "invalid-id")).rejects.toMatchObject({ code: "VALIDATION" });
  for (const query of [{ since: -1 }, { before: 0 }, { since: 2 }, { since: 0, before: 1 }]) await expect(getChatPage(f.owner.id, f.tripId, query)).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(markChatRead(f.owner.id, f.tripId, -1)).rejects.toMatchObject({ code: "VALIDATION" });
  const clientId = randomUUID();
  const first = await send(f.owner.id, f.tripId, "First", clientId);
  await prisma.chatMessage.createMany({ data: Array.from({ length: 29 }, (_, i) => ({ tripId: f.tripId, senderId: f.owner.id, senderName: "Ana", clientId: randomUUID(), body: "Fixture", seq: i + 2, revision: i + 2 })) });
  await expect(send(f.owner.id, f.tripId, "Too fast")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect((await send(f.owner.id, f.tripId, "First", clientId)).id).toBe(first.id);
});

it("keeps message content out of exports and avoids refreshing trip forms through revision changes", async () => {
  const f = await fixture();
  const before = await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } });
  await send(f.viewer.id, f.tripId, "Private group chat fixture");
  const after = await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } });
  expect(after.revision).toBe(before.revision);
  expect(after.version).toBe(before.version);
  expect(after.lastChangedById).toBe(before.lastChangedById);
  expect(JSON.stringify(await exportTripJson(f.owner.id, f.tripId))).not.toContain("Private group chat fixture");
});

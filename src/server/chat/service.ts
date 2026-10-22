import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import type { ChatMessage } from "@/generated/prisma/client";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { CHAT_MAX_LENGTH, type ChatPage, type ChatMessageView, type ChatSummary } from "@/lib/chat";

export const chatCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("send"), clientId: z.uuid(), body: z.string().trim().min(1).max(CHAT_MAX_LENGTH) }).strict(),
  z.object({ op: z.literal("read"), seq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict(),
  z.object({ op: z.literal("delete"), id: z.string().min(1).max(64) }).strict(),
]);
const unreadWhere = (userId: string, tripId: string, readSeq: number) => ({ tripId, seq: { gt: readSeq }, deletedAt: null, OR: [{ senderId: { not: userId } }, { senderId: null }] });
function view(message: ChatMessage, userId: string): ChatMessageView {
  return { id: message.id, senderId: message.senderId, senderName: message.senderName, clientId: message.senderId === userId ? message.clientId : null, seq: message.seq, revision: message.revision, body: message.deletedAt ? "" : message.body, createdAt: message.createdAt.toISOString(), deletedAt: message.deletedAt?.toISOString() ?? null };
}

async function access(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "view");
  return prisma.tripMembership.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId } }, include: { trip: { select: { chatRevision: true, chatSeq: true, timezone: true, _count: { select: { memberships: true } } } } } });
}

export async function getChatSummary(userId: string, tripId: string): Promise<ChatSummary> {
  const member = await access(userId, tripId);
  return { unread: await prisma.chatMessage.count({ where: unreadWhere(userId, tripId, member.chatReadSeq) }), revision: member.trip.chatRevision, readSeq: member.chatReadSeq };
}

export async function getChatPage(userId: string, tripId: string, input: { before?: number; since?: number } = {}): Promise<ChatPage> {
  const parsed = z.object({ before: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(), since: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).strict().safeParse(input);
  if (!parsed.success || (input.before !== undefined && input.since !== undefined)) throw new AppError("VALIDATION", "Invalid chat page.");
  const member = await access(userId, tripId);
  if (input.since !== undefined && input.since > member.trip.chatRevision) throw new AppError("VALIDATION", "Invalid chat update cursor.");
  const updates = input.since !== undefined;
  const limit = updates ? 100 : 50;
  const rows = await prisma.chatMessage.findMany({ where: { tripId, ...(updates ? { revision: { gt: input.since! } } : input.before ? { seq: { lt: input.before } } : {}) }, orderBy: updates ? { revision: "asc" } : { seq: "desc" }, take: limit + 1 });
  const selected = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const revision = updates && hasMore ? selected.at(-1)!.revision : member.trip.chatRevision;
  return { messages: (updates ? selected : selected.reverse()).map(m => view(m, userId)), revision, hasMore, summary: { unread: await prisma.chatMessage.count({ where: unreadWhere(userId, tripId, member.chatReadSeq) }), revision: member.trip.chatRevision, readSeq: member.chatReadSeq }, memberCount: member.trip._count.memberships, timezone: member.trip.timezone };
}

/** One generic in-app alert per unread conversation. Message text never enters email or audit payloads. */
async function alertMembers(tx: Tx, tripId: string, actorId: string, actorName: string, messageId: string, tripName: string) {
  const audit = await tx.auditLog.create({ data: { tripId, actorId, actorName, entity: "chat", entityId: messageId, action: "message" } });
  const members = await tx.tripMembership.findMany({ where: { tripId, userId: { not: actorId } } });
  for (const member of members) {
    const previous = await tx.tripNotification.findFirst({ where: { tripId, userId: member.userId, readAt: null, audit: { entity: "chat" } } });
    const data = { auditId: audit.id, tripName, summary: `${actorName || "A trip member"} sent a message in trip chat.`, href: `/trips/${tripId}/chat`, createdAt: new Date() };
    if (previous) await tx.tripNotification.update({ where: { id: previous.id }, data });
    else await tx.tripNotification.create({ data: { ...data, tripId, userId: member.userId } });
  }
}

export async function sendChatMessage(userId: string, tripId: string, input: { clientId: string; body: string }): Promise<ChatMessageView> {
  await requireTrip(tripId, userId, "view");
  const parsed = chatCommand.safeParse({ op: "send", ...input });
  if (!parsed.success || parsed.data.op !== "send") throw new AppError("VALIDATION", `Enter a message of up to ${CHAT_MAX_LENGTH.toLocaleString("en")} characters.`);
  const { clientId, body } = parsed.data;
  return prisma.$transaction(async tx => {
    const member = await tx.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId } }, include: { user: { select: { name: true } } } });
    if (!member) throw new AppError("NOT_FOUND", "Trip not found.");
    const previous = await tx.chatMessage.findUnique({ where: { tripId_senderId_clientId: { tripId, senderId: userId, clientId } } });
    if (previous) {
      if (!previous.deletedAt && previous.body !== body) throw new AppError("CONFLICT", "This send attempt was already used for another message. Please try again.");
      return view(previous, userId);
    }
    if (await tx.chatMessage.count({ where: { tripId, senderId: userId, createdAt: { gt: new Date(Date.now() - 60_000) } } }) >= 30) throw new AppError("RATE_LIMITED", "Please wait a minute before sending more messages.");
    const trip = await tx.trip.update({ where: { id: tripId }, data: { chatSeq: { increment: 1 }, chatRevision: { increment: 1 } }, select: { name: true, chatSeq: true, chatRevision: true } });
    const message = await tx.chatMessage.create({ data: { tripId, senderId: userId, senderName: member.user.name, clientId, body, seq: trip.chatSeq, revision: trip.chatRevision } });
    await alertMembers(tx, tripId, userId, member.user.name, message.id, trip.name);
    return view(message, userId);
  });
}

export async function markChatRead(userId: string, tripId: string, seq: number): Promise<ChatSummary> {
  await requireTrip(tripId, userId, "view");
  if (!Number.isSafeInteger(seq) || seq < 0) throw new AppError("VALIDATION", "Invalid read position.");
  await prisma.$transaction(async tx => {
    const member = await tx.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId } }, include: { trip: { select: { chatSeq: true } } } });
    if (!member) throw new AppError("NOT_FOUND", "Trip not found.");
    const through = Math.min(seq, member.trip.chatSeq);
    await tx.tripMembership.updateMany({ where: { id: member.id, chatReadSeq: { lt: through } }, data: { chatReadSeq: through } });
    const readSeq = Math.max(through, member.chatReadSeq);
    const unread = await tx.chatMessage.count({ where: unreadWhere(userId, tripId, readSeq) });
    if (!unread) await tx.tripNotification.updateMany({ where: { tripId, userId, readAt: null, audit: { entity: "chat" } }, data: { readAt: new Date() } });
  });
  return getChatSummary(userId, tripId);
}

export async function deleteChatMessage(userId: string, tripId: string, messageId: string): Promise<ChatMessageView> {
  await requireTrip(tripId, userId, "view");
  if (typeof messageId !== "string" || messageId.length > 64) throw new AppError("VALIDATION", "Invalid message.");
  return prisma.$transaction(async tx => {
    const member = await tx.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId } } });
    if (!member) throw new AppError("NOT_FOUND", "Trip not found.");
    const message = await tx.chatMessage.findFirst({ where: { id: messageId, tripId } });
    if (!message) throw new AppError("NOT_FOUND", "Message not found.");
    if (message.senderId !== userId && member.role !== "OWNER") throw new AppError("FORBIDDEN", "You can only delete your own messages. The trip owner can moderate the chat.");
    if (message.deletedAt) return view(message, userId);
    const trip = await tx.trip.update({ where: { id: tripId }, data: { chatRevision: { increment: 1 } }, select: { chatRevision: true } });
    const deleted = await tx.chatMessage.update({ where: { id: message.id }, data: { body: "", deletedAt: new Date(), revision: trip.chatRevision } });
    for (const recipient of await tx.tripMembership.findMany({ where: { tripId } })) {
      if (!await tx.chatMessage.count({ where: unreadWhere(recipient.userId, tripId, recipient.chatReadSeq) })) await tx.tripNotification.updateMany({ where: { tripId, userId: recipient.userId, readAt: null, audit: { entity: "chat" } }, data: { readAt: new Date() } });
    }
    return view(deleted, userId);
  });
}

export type ChatMessageView = { id: string; senderId: string | null; senderName: string; clientId: string | null; seq: number; revision: number; body: string; createdAt: string; deletedAt: string | null };
export type ChatSummary = { unread: number; revision: number; readSeq: number };
export type ChatPage = { messages: ChatMessageView[]; revision: number; hasMore: boolean; summary: ChatSummary; memberCount: number; timezone: string };
export const CHAT_POLL_MS = 3000;
export const CHAT_MAX_LENGTH = 4000;

/** Retain loaded history while applying new messages and deletion tombstones. */
export function mergeChatMessages(current: ChatMessageView[], incoming: ChatMessageView[], history = false) {
  const byId = new Map(current.map(m => [m.id, m]));
  for (const message of incoming) {
    const previous = byId.get(message.id);
    if (previous && previous.revision > message.revision) continue;
    if (!previous && message.deletedAt && !history) continue;
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}

export function newerChatSummary(previous: ChatSummary, next: ChatSummary) {
  return next.revision >= previous.revision && next.readSeq >= previous.readSeq ? next : previous;
}

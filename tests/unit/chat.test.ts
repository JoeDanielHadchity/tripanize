import { expect, it } from "vitest";
import { mergeChatMessages, newerChatSummary, type ChatMessageView } from "@/lib/chat";

const message = (seq: number, revision = seq, deleted = false): ChatMessageView => ({ id: `message-${seq}`, senderId: "member", senderName: "Fixture", clientId: null, seq, revision, body: deleted ? "" : `Message ${seq}`, createdAt: "2026-10-22T10:00:00Z", deletedAt: deleted ? "2026-10-22T10:01:00Z" : null });

it("merges retries, polling and history in sequence without repeating messages", () => {
  const current = [message(3), message(4)];
  expect(mergeChatMessages(current, [message(4), message(5)]).map(m => m.seq)).toEqual([3, 4, 5]);
  expect(mergeChatMessages(current, [message(1), message(2)], true).map(m => m.seq)).toEqual([1, 2, 3, 4]);
});
it("applies deletions to loaded history without resurrecting stale text or appending unrelated tombstones", () => {
  const deleted = mergeChatMessages([message(1)], [message(1, 5, true), message(2, 6, true)]);
  expect(deleted).toHaveLength(1);
  expect(deleted[0].body).toBe("");
  expect(mergeChatMessages(deleted, [message(1)], true)[0].body).toBe("");
  expect(mergeChatMessages([], [message(2, 6, true)], true)).toHaveLength(1);
});
it("ignores stale unread counts after a newer read marker or chat revision", () => {
  const known = { unread: 0, revision: 5, readSeq: 5 };
  expect(newerChatSummary(known, { unread: 1, revision: 5, readSeq: 4 })).toBe(known);
  expect(newerChatSummary(known, { unread: 1, revision: 4, readSeq: 5 })).toBe(known);
  expect(newerChatSummary(known, { unread: 1, revision: 6, readSeq: 5 }).unread).toBe(1);
});

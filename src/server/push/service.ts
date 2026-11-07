import { z } from "zod";
import { prisma, type Tx } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";

/** Categories a person can turn off in the app. "group" covers votes,
 * invitations, people joining and shared expenses. */
export const PUSH_CATEGORIES = ["chat", "events", "group", "reminders"] as const;
export type PushCategory = typeof PUSH_CATEGORIES[number];
export type PushSettings = Record<PushCategory, boolean>;

type Db = Pick<Tx, "pushDevice" | "pushSetting" | "pushMessage">;
const DEFAULTS: PushSettings = { chat: true, events: true, group: true, reminders: true };
const MAX_DEVICES = 10;
const oneLine = (value: string, max: number) => value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);

/** Expo push tokens only. Raw FCM/APNs tokens are never accepted. */
export const pushToken = z.string().max(200).regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/, "Invalid push token.");

export type QueuePush = {
  userIds: string[]; tripId?: string; category: PushCategory; title: string; body: string; href: string; dedupeKey: string;
  /** Collapse into an unsent message with this key prefix (for example a chat burst). */
  collapse?: { prefix: string; body: (count: number) => string };
};

/** Outbox write only: it is safe inside the transaction that saves the change.
 * People without a registered device, or with the category off, get nothing. */
export async function queuePush(tx: Db, push: QueuePush): Promise<number> {
  const userIds = [...new Set(push.userIds)];
  if (!userIds.length) return 0;
  const devices = await tx.pushDevice.findMany({ where: { userId: { in: userIds } }, select: { userId: true } });
  const withDevice = new Set(devices.map(d => d.userId));
  const settings = await tx.pushSetting.findMany({ where: { userId: { in: [...withDevice] } } });
  const title = oneLine(push.title, 80), body = oneLine(push.body, 220), href = push.href.slice(0, 300);
  let queued = 0;
  for (const userId of userIds) {
    if (!withDevice.has(userId)) continue;
    const setting = settings.find(s => s.userId === userId);
    if (setting && !setting[push.category]) continue;
    if (push.collapse) {
      const open = await tx.pushMessage.findFirst({ where: { userId, status: "queued", dedupeKey: { startsWith: push.collapse.prefix } }, orderBy: { createdAt: "desc" } });
      if (open) {
        const count = (Number(/#(\d+)$/.exec(open.dedupeKey)?.[1]) || 1) + 1;
        await tx.pushMessage.update({ where: { id: open.id }, data: { title, body: oneLine(push.collapse.body(count), 220), href, dedupeKey: `${push.collapse.prefix}${push.dedupeKey}#${count}` } });
        queued++;
        continue;
      }
    }
    const key = push.collapse ? `${push.collapse.prefix}${push.dedupeKey}` : push.dedupeKey;
    const existing = await tx.pushMessage.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: key } }, select: { id: true } });
    if (existing) continue;
    await tx.pushMessage.create({ data: { userId, tripId: push.tripId, category: push.category, title, body, href, dedupeKey: key } });
    queued++;
  }
  return queued;
}

/** Queue, then wake the durable alarm that owns delivery. */
export async function queuePushAndWake(tx: Db, push: QueuePush) {
  const queued = await queuePush(tx, push);
  if (queued) await currentRuntime().wakeNotifications?.();
  return queued;
}

export async function getPushSettings(userId: string) {
  const [setting, devices] = await Promise.all([
    prisma.pushSetting.findUnique({ where: { userId } }),
    prisma.pushDevice.count({ where: { userId } }),
  ]);
  const settings = Object.fromEntries(PUSH_CATEGORIES.map(c => [c, setting ? setting[c] : DEFAULTS[c]])) as PushSettings;
  return { settings, devices };
}

const command = z.discriminatedUnion("op", [
  z.object({ op: z.literal("register"), token: pushToken, platform: z.enum(["ios", "android"]), appVersion: z.string().max(40).optional() }),
  z.object({ op: z.literal("unregister"), token: pushToken }),
  z.object({ op: z.literal("settings"), settings: z.object(Object.fromEntries(PUSH_CATEGORIES.map(c => [c, z.boolean().optional()]))) }),
]);

export async function changePush(userId: string, input: unknown) {
  const parsed = command.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid notification setting.");
  const c = parsed.data;
  await rateLimit(`push:${userId}`, 120, 3600);
  if (c.op === "register") {
    await prisma.$transaction(async tx => {
      // One phone belongs to whoever signed in last on it.
      await tx.pushDevice.upsert({ where: { token: c.token }, create: { userId, token: c.token, platform: c.platform, appVersion: c.appVersion }, update: { userId, platform: c.platform, appVersion: c.appVersion, lastSeenAt: new Date() } });
      const extra = await tx.pushDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: "desc" }, skip: MAX_DEVICES, select: { id: true } });
      if (extra.length) await tx.pushDevice.deleteMany({ where: { id: { in: extra.map(d => d.id) } } });
    });
  } else if (c.op === "unregister") {
    await prisma.pushDevice.deleteMany({ where: { token: c.token, userId } });
  } else {
    const data = Object.fromEntries(Object.entries(c.settings).filter(([, v]) => typeof v === "boolean")) as Partial<PushSettings>;
    await prisma.pushSetting.upsert({ where: { userId }, create: { userId, ...DEFAULTS, ...data }, update: data });
    // Turning a category off also drops anything of that kind still waiting.
    const off = PUSH_CATEGORIES.filter(k => data[k] === false);
    if (off.length) await prisma.pushMessage.updateMany({ where: { userId, status: "queued", category: { in: off } }, data: { status: "cancelled" } });
  }
  return getPushSettings(userId);
}

// ───────────────────────── Delivery ─────────────────────────

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100, MAX_ATTEMPTS = 6, STALE_MS = 24 * 3600_000, CLAIM_MS = 10 * 60_000;
type Ticket = { status: "ok"; id?: string } | { status: "error"; message?: string; details?: { error?: string } };

export async function nextPushAt(): Promise<Date | null> {
  const next = await prisma.pushMessage.findFirst({ where: { status: "queued" }, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } });
  return next?.nextAttemptAt ?? null;
}

/** Sends one batch of due messages through the Expo push service. Each message
 * is claimed before the network call, so a restart retries instead of losing it.
 * Returns true when more messages are already due. */
export async function sendDuePush(send: typeof fetch = fetch, now = new Date()): Promise<boolean> {
  await prisma.pushMessage.updateMany({ where: { status: "queued", createdAt: { lt: new Date(now.getTime() - STALE_MS) } }, data: { status: "cancelled", error: "Expired before delivery." } });
  const due = await prisma.pushMessage.findMany({ where: { status: "queued", nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: BATCH, include: { user: { select: { pushDevices: { select: { id: true, token: true } } } } } });
  if (!due.length) return false;
  const ready = due.filter(m => m.user.pushDevices.length);
  const orphaned = due.filter(m => !m.user.pushDevices.length).map(m => m.id);
  if (orphaned.length) await prisma.pushMessage.updateMany({ where: { id: { in: orphaned } }, data: { status: "cancelled", error: "No registered device." } });
  const messages: { messageId: string; deviceId: string; payload: Record<string, unknown> }[] = [];
  for (const m of ready) for (const d of m.user.pushDevices) {
    if (messages.length >= BATCH) break;
    messages.push({ messageId: m.id, deviceId: d.id, payload: { to: d.token, title: m.title, body: m.body, data: { href: m.href, tripId: m.tripId, category: m.category }, sound: "default", channelId: m.category, priority: m.category === "chat" ? "high" : "default" } });
  }
  const included = [...new Set(messages.map(m => m.messageId))];
  if (!included.length) return false;
  await prisma.pushMessage.updateMany({ where: { id: { in: included } }, data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + CLAIM_MS) } });
  const token = currentRuntime().expoAccessToken;
  let tickets: Ticket[] | null = null, failure = "Push service unavailable.";
  try {
    const response = await send(EXPO_PUSH_URL, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(messages.map(m => m.payload)), signal: AbortSignal.timeout(20_000) });
    const body = await response.json().catch(() => null) as { data?: Ticket[]; errors?: { message?: string }[] } | null;
    if (response.ok && Array.isArray(body?.data) && body.data.length === messages.length) tickets = body.data;
    else failure = oneLine(body?.errors?.[0]?.message ?? `Push service returned ${response.status}.`, 300);
  } catch (error) { failure = error instanceof Error ? oneLine(error.message, 300) : failure; }
  if (!tickets) {
    const rows = await prisma.pushMessage.findMany({ where: { id: { in: included } }, select: { id: true, attempts: true } });
    for (const row of rows) {
      const giveUp = row.attempts >= MAX_ATTEMPTS;
      await prisma.pushMessage.update({ where: { id: row.id }, data: giveUp ? { status: "failed", error: failure } : { error: failure, nextAttemptAt: new Date(now.getTime() + Math.min(6 * 3600_000, 60_000 * 2 ** row.attempts)) } });
    }
    return false;
  }
  const dead = new Set<string>(), delivered = new Set<string>(), errors = new Map<string, string>();
  tickets.forEach((ticket, i) => {
    const m = messages[i];
    if (ticket.status === "ok") delivered.add(m.messageId);
    else {
      if (ticket.details?.error === "DeviceNotRegistered") dead.add(m.deviceId);
      errors.set(m.messageId, oneLine(ticket.message ?? ticket.details?.error ?? "Rejected by the push service.", 300));
    }
  });
  if (dead.size) await prisma.pushDevice.deleteMany({ where: { id: { in: [...dead] } } });
  for (const id of included) {
    await prisma.pushMessage.update({ where: { id }, data: delivered.has(id) ? { status: "sent", sentAt: now, error: null } : { status: "failed", error: errors.get(id) ?? "Rejected by the push service." } });
  }
  return due.length === BATCH;
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { billingEnvironment } from "@/server/billing/config";
import { queuePush } from "@/server/push/service";
import { emailConfigured, sendEmail } from "@/server/notifications/email";
import { rateLimit } from "@/server/ratelimit";
import { requireCompanyAdmin } from "./identity";
import { adminAudit } from "./audit";

export const AUDIENCES = {
  all: "Everyone",
  buyers: "People who bought Premium or credits",
  recent: "Joined in the last 30 days",
  inactive: "Not seen in 30+ days",
  testers: "Credit testers",
} as const;
export type Audience = keyof typeof AUDIENCES;
export type Channels = "push" | "email" | "both";

const DAY = 86400_000;
/** User ids in an audience. Suspended accounts never receive messages. */
async function audienceIds(audience: Audience): Promise<string[]> {
  const since = new Date(Date.now() - 30 * DAY);
  if (audience === "buyers") {
    const env = billingEnvironment();
    const [premium, credits] = await Promise.all([
      prisma.premiumCheckout.findMany({ where: { environment: env, status: "COMPLETED", reviewRequired: false }, select: { buyerId: true } }),
      prisma.creditCheckout.findMany({ where: { environment: env, status: "COMPLETED", reviewRequired: false }, select: { buyerId: true } }),
    ]);
    const ids = [...new Set([...premium, ...credits].map(p => p.buyerId))];
    return (await prisma.user.findMany({ where: { id: { in: ids }, suspendedAt: null }, select: { id: true } })).map(u => u.id);
  }
  const where = audience === "recent" ? { createdAt: { gte: since } } : audience === "inactive" ? { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: since } }] } : audience === "testers" ? { creditsTester: true } : {};
  return (await prisma.user.findMany({ where: { ...where, suspendedAt: null }, select: { id: true } })).map(u => u.id);
}

/** How many people each channel would reach: push needs the app with news alerts on; email needs the opt-in. */
async function reach(ids: string[]) {
  if (!ids.length) return { push: 0, email: 0, people: 0 };
  const [devices, newsOff, email] = await Promise.all([
    prisma.pushDevice.findMany({ where: { userId: { in: ids } }, select: { userId: true }, distinct: ["userId"] }),
    prisma.pushSetting.findMany({ where: { userId: { in: ids }, news: false }, select: { userId: true } }),
    prisma.user.count({ where: { id: { in: ids }, newsEmails: true, emailVerified: true } }),
  ]);
  const off = new Set(newsOff.map(s => s.userId));
  return { push: devices.filter(d => !off.has(d.userId)).length, email, people: ids.length };
}

export async function adminBroadcasts(actorId: string) {
  await requireCompanyAdmin(actorId);
  const [history, counts, optedIn] = await Promise.all([
    prisma.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    Promise.all((Object.keys(AUDIENCES) as Audience[]).map(async a => [a, await reach(await audienceIds(a))] as const)),
    prisma.user.count({ where: { newsEmails: true, emailVerified: true, suspendedAt: null } }),
  ]);
  return { history, reach: Object.fromEntries(counts) as Record<Audience, { push: number; email: number; people: number }>, optedIn, emailConfigured: emailConfigured() };
}

const link = z.string().trim().max(300).refine(h => h.startsWith("/") && !h.startsWith("//"), "Use a link to a Tripanize page, starting with /.");
export const broadcastInput = z.object({
  title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(500), href: link,
  channels: z.enum(["push", "email", "both"]), audience: z.enum(Object.keys(AUDIENCES) as [Audience, ...Audience[]]), test: z.boolean(),
}).strict();
export type BroadcastInput = z.input<typeof broadcastInput>;

/** Test: only to you, right away. Real send: push is queued for everyone in the
 * audience with the app; emails are queued for those who opted in and sent a few at a time. */
export async function sendBroadcast(actorId: string, input: unknown) {
  await requireCompanyAdmin(actorId);
  const m = broadcastInput.parse(input);
  const push = m.channels !== "email", email = m.channels !== "push";
  if (email && !emailConfigured()) throw new AppError("NOT_CONFIGURED", "Email isn't set up on the server, so only push can be sent.");
  if (m.test) {
    await rateLimit(`broadcast-test:${actorId}`, 20, 3600);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { email: true } });
    let pushed = 0;
    if (push) pushed = await queuePush(prisma, { userIds: [actorId], category: "news", title: m.title, body: m.body, href: m.href, dedupeKey: `news-test:${Date.now()}` });
    if (push && pushed) await currentRuntime().wakeNotifications?.();
    if (email) {
      const result = await sendEmail(newsEmail(actorId, me.email, m.title, m.body, m.href));
      if (result.status !== "sent") throw new AppError("UPSTREAM", "The test email could not be sent. Check the email setup on the Health page.");
    }
    return { test: true, push: pushed, email: email ? 1 : 0, noDevice: push && !pushed };
  }
  await rateLimit(`broadcast:${actorId}`, 10, 24 * 3600);
  const ids = await audienceIds(m.audience);
  const broadcast = await prisma.broadcast.create({ data: { title: m.title, body: m.body, href: m.href, channels: m.channels, audience: m.audience, status: "SENDING", createdById: actorId } });
  let pushQueued = 0, emailQueued = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    if (push) pushQueued += await queuePush(prisma, { userIds: chunk, category: "news", title: m.title, body: m.body, href: m.href, dedupeKey: `news:${broadcast.id}` });
    if (email) {
      const optedIn = await prisma.user.findMany({ where: { id: { in: chunk }, newsEmails: true, emailVerified: true }, select: { id: true } });
      if (optedIn.length) { await prisma.broadcastDelivery.createMany({ data: optedIn.map(u => ({ broadcastId: broadcast.id, userId: u.id })) }); emailQueued += optedIn.length; }
    }
  }
  await prisma.broadcast.update({ where: { id: broadcast.id }, data: { pushQueued, emailQueued, ...(emailQueued ? {} : { status: "SENT", sentAt: new Date() }) } });
  await adminAudit(actorId, "broadcast.send", "broadcast", broadcast.id, { audience: m.audience, channels: m.channels, pushQueued, emailQueued });
  await currentRuntime().wakeNotifications?.();
  return { test: false, push: pushQueued, email: emailQueued, noDevice: false };
}

// ───────────── News emails and unsubscribe ─────────────

const secret = () => currentRuntime().authSecret;
const sign = (userId: string) => createHmac("sha256", secret()).update(`news-unsubscribe:${userId}`).digest("base64url");
export function unsubscribeUrl(userId: string) {
  const base = (currentRuntime().appUrl ?? "https://www.tripanize.app").replace(/\/$/, "");
  return `${base}/api/news/unsubscribe?u=${encodeURIComponent(userId)}&s=${sign(userId)}`;
}
export function verifyUnsubscribe(userId: string, signature: string) {
  const a = Buffer.from(sign(userId)), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

function newsEmail(userId: string, to: string, title: string, body: string, href: string) {
  const base = (currentRuntime().appUrl ?? "https://www.tripanize.app").replace(/\/$/, "");
  const url = base + href, off = unsubscribeUrl(userId);
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return {
    to, subject: title,
    text: `${body}\n\nOpen Tripanize: ${url}\n\n—\nYou're getting this because you chose to receive Tripanize news. Unsubscribe: ${off}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;color:#172e33"><h1 style="font-size:22px">${esc(title)}</h1><p style="font-size:16px;line-height:1.5;white-space:pre-line">${esc(body)}</p><p><a href="${esc(url)}" style="display:inline-block;background:#0b6e74;color:#fff;padding:12px 20px;border-radius:24px;text-decoration:none;font-weight:600">Open Tripanize</a></p><p style="font-size:12px;color:#56656a;margin-top:32px">You're getting this because you chose to receive Tripanize news. <a href="${esc(off)}" style="color:#56656a">Unsubscribe</a></p></div>`,
    idempotencyKey: undefined as string | undefined,
  };
}

export async function nextBroadcastEmailAt(): Promise<Date | null> {
  const next = await prisma.broadcastDelivery.findFirst({ where: { status: "queued" }, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } });
  return next?.nextAttemptAt ?? null;
}

/** Sends up to `batch` due news emails. Returns true when more are already due. */
export async function sendDueBroadcastEmails(batch = 10, now = new Date()): Promise<boolean> {
  const due = await prisma.broadcastDelivery.findMany({ where: { status: "queued", nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: batch, include: { broadcast: true, user: { select: { email: true, newsEmails: true, suspendedAt: true } } } });
  for (const d of due) {
    // Someone who unsubscribed after the send was started is skipped.
    if (!d.user.newsEmails || d.user.suspendedAt || d.broadcast.status === "CANCELLED") { await prisma.broadcastDelivery.update({ where: { id: d.id }, data: { status: "skipped" } }); continue; }
    const msg = newsEmail(d.userId, d.user.email, d.broadcast.title, d.broadcast.body, d.broadcast.href);
    const result = await sendEmail({ ...msg, idempotencyKey: `news-${d.id}` });
    if (result.status === "sent") {
      await prisma.broadcastDelivery.update({ where: { id: d.id }, data: { status: "sent", sentAt: new Date(), attempts: { increment: 1 }, error: null } });
      await prisma.broadcast.update({ where: { id: d.broadcastId }, data: { emailSent: { increment: 1 } } });
    } else {
      const attempts = d.attempts + 1, retry = result.status === "failed" && result.retryable && attempts < 5;
      await prisma.broadcastDelivery.update({ where: { id: d.id }, data: { attempts, status: retry ? "queued" : "failed", error: result.status === "failed" ? result.error.slice(0, 200) : "Email not configured", nextAttemptAt: new Date(Date.now() + Math.max(result.status === "failed" ? result.retryAfterMs ?? 0 : 0, 60_000 * 2 ** attempts)) } });
      if (!retry) await prisma.broadcast.update({ where: { id: d.broadcastId }, data: { emailFailed: { increment: 1 } } });
    }
  }
  // A broadcast is done when none of its emails are still waiting.
  const sending = await prisma.broadcast.findMany({ where: { status: "SENDING" }, select: { id: true } });
  for (const b of sending) if (!await prisma.broadcastDelivery.count({ where: { broadcastId: b.id, status: "queued" } })) await prisma.broadcast.update({ where: { id: b.id }, data: { status: "SENT", sentAt: new Date() } });
  return Boolean(await prisma.broadcastDelivery.count({ where: { status: "queued", nextAttemptAt: { lte: new Date() } } }));
}

/** The person's own choice; off until they turn it on. */
export async function setNewsEmails(userId: string, enabled: boolean) {
  await prisma.user.update({ where: { id: userId }, data: { newsEmails: enabled, newsEmailsAt: new Date() } });
}

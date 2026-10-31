import { getTripPlan } from "@/server/plans/access";
import { prisma, type Tx } from "@/server/db";
import type { AuditLog } from "@/generated/prisma/client";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { emailConfigured, sendEmail } from "./email";
import { queuePush } from "@/server/push/service";

import { bookingReminderStillRelevant } from "@/server/bookings/reminders";

const sections: Record<string, [string, string]> = {
  stop: ["an itinerary stop", "itinerary"], day: ["an itinerary day", "itinerary"],
  itinerary: ["the itinerary", "itinerary"], booking: ["a booking", "bookings"],
  attachment: ["a booking attachment", "bookings"], expense: ["an expense", "expenses"],
  settlement: ["a repayment", "expenses"], event: ["an event", "events"],
  packing: ["the shared packing list", "packing"], task: ["a trip task", "today"],
  trip: ["trip details", "settings"], membership: ["trip membership", "settings"],
  traveler: ["a traveler", "settings"], invitation: ["a trip invitation", "settings"],
  poll: ["a group vote", "votes"],
  trial: ["Premium trial access", "premium"],
  discovery: ["event discovery settings", "events"], preferences: ["planning preferences", "itinerary"],
};
const verbs: Record<string, string> = {
  create: "added", update: "updated", delete: "removed", status: "updated the status of",
  skip: "skipped", move: "moved", swap: "replaced", reorder: "reordered",
  restore: "restored", apply_ai: "applied an AI plan to", plan_A: "switched to Plan A for",
  plan_B: "switched to Plan B for", saved: "saved", hidden: "hid", new: "reset",
  schedule: "scheduled", done: "completed", undone: "reopened", archive: "archived",
  vote: "voted in", decide: "finalized", reopen: "reopened",
  role: "changed a role in", transfer_owner: "transferred ownership in", revoke: "revoked",
};

/** Votes, people joining and shared money; ordinary itinerary edits stay in the inbox. */
function pushWorthy(change: AuditLog) {
  return (["expense", "settlement"].includes(change.entity) && change.action === "create") ||
    (change.entity === "poll" && ["create", "decide"].includes(change.action)) ||
    (change.entity === "membership" && change.action === "join");
}

export async function queueChangeNotifications(tx: Tx, change: AuditLog) {
  // Only explicit shared human edits are broadcast. Personal data never calls this hook.
  const section = sections[change.entity];
  if (!change.actorId || !section || (change.entity === "trip" && change.action === "create")) return;
  const trip = await tx.trip.findUniqueOrThrow({ where: { id: change.tripId }, select: { name: true } });
  const members = await tx.tripMembership.findMany({ where: { tripId: change.tripId, userId: { not: change.actorId } }, include: { user: { select: { email: true, emailVerified: true } } } });
  const prefs = await tx.notificationPreference.findMany({ where: { tripId: change.tripId, changeEmailEnabled: true } });
  const enabled = new Set(prefs.map(p => p.userId));
  const actor = (change.actorName || "A trip member").replace(/[\r\n]+/g, " ");
  const summary = change.entity === "membership" && change.action === "join" ? `${actor} joined the trip.`
    : change.entity === "membership" && change.action === "leave" ? `${actor} left the trip.`
    : `${actor} ${verbs[change.action] ?? "updated"} ${section[0]}.`;
  const href = `/trips/${change.tripId}/${section[1]}`;
  const origin = (currentRuntime().appUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  let queued = false;
  for (const member of members) {
    const email = enabled.has(member.userId) && member.user.emailVerified;
    await tx.tripNotification.create({ data: {
      userId: member.userId, tripId: change.tripId, auditId: change.id, tripName: trip.name, summary, href,
      ...(email ? {
        emailTo: member.user.email, emailSubject: `Tripanize: ${trip.name.replace(/[\r\n]+/g, " ").slice(0, 100)} updated`,
        emailText: `${summary}\n\nTrip: ${trip.name}\n\nView the change:\n${origin}${href}\n\nYou enabled emails for shared trip changes. Manage your alerts:\n${origin}/trips/${change.tripId}/settings#notifications`,
        emailStatus: "queued", nextAttemptAt: new Date(),
      } : {}),
    } });
    queued ||= email;
  }
  // Phone alerts only for the group moments people asked to hear about right away.
  const pushed = pushWorthy(change) ? await queuePush(tx, { userIds: members.map(m => m.userId), tripId: change.tripId, category: "group", title: trip.name, body: summary, href, dedupeKey: `change:${change.id}` }) : 0;
  // This only sets a durable alarm. The sender runs after the enclosing transaction.
  if (queued || pushed) await currentRuntime().wakeNotifications?.();
}

const inboxWhere = (userId: string) => ({ userId, kind: { not: "event_email" }, trip: { memberships: { some: { userId } } } });

export async function listChangeNotifications(userId: string, cursor?: string) {
  let older: { createdAt: Date; id: string } | null = null;
  if (cursor) {
    older = await prisma.tripNotification.findFirst({ where: { ...inboxWhere(userId), id: cursor }, select: { createdAt: true, id: true } });
    if (!older) throw new AppError("VALIDATION", "Invalid notification page.");
  }
  const items = await prisma.tripNotification.findMany({
    where: { ...inboxWhere(userId), ...(older ? { OR: [{ createdAt: { lt: older.createdAt } }, { createdAt: older.createdAt, id: { lt: older.id } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31,
    select: { id: true, tripName: true, summary: true, href: true, readAt: true, createdAt: true },
  });
  const unread = await prisma.tripNotification.count({ where: { ...inboxWhere(userId), readAt: null } });
  const profile = await prisma.profile.findUnique({ where: { userId }, select: { timezone: true } });
  return { items: items.slice(0, 30).map(n => ({ ...n, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() })), unread, nextCursor: items.length > 30 ? items[29].id : null, checkedAt: new Date().toISOString(), timezone: profile?.timezone ?? "UTC" };
}

export async function markChangeNotificationsRead(userId: string, input: { id: string } | { before: string }) {
  if (!input || typeof input !== "object") throw new AppError("VALIDATION", "Choose a notification.");
  const where = inboxWhere(userId);
  if ("id" in input) {
    if (typeof input.id !== "string" || input.id.length > 64) throw new AppError("VALIDATION", "Invalid notification.");
    await prisma.tripNotification.updateMany({ where: { ...where, id: input.id, readAt: null }, data: { readAt: new Date() } });
  } else {
    const before = typeof input.before === "string" ? new Date(input.before) : new Date(NaN);
    if (!Number.isFinite(before.getTime()) || before.getTime() > Date.now() + 1000) throw new AppError("VALIDATION", "Invalid notification time.");
    await prisma.tripNotification.updateMany({ where: { ...where, readAt: null, createdAt: { lte: before } }, data: { readAt: new Date() } });
  }
}

export async function setChangeEmailPreference(userId: string, tripId: string, enabled: boolean) {
  await requireTrip(tripId, userId, "view");
  if (typeof enabled !== "boolean") throw new AppError("VALIDATION", "Choose whether to receive emails.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (enabled && !user.emailVerified) throw new AppError("VALIDATION", "Verify your email by signing in with an email code before enabling alerts.");
  if (enabled && !emailConfigured()) throw new AppError("NOT_CONFIGURED", "Email delivery is unavailable. In-app notifications are still on.");
  await prisma.$transaction(async tx => {
    await tx.notificationPreference.upsert({ where: { userId_tripId: { userId, tripId } }, create: { userId, tripId, changeEmailEnabled: enabled }, update: { changeEmailEnabled: enabled } });
    if (!enabled) await tx.tripNotification.updateMany({ where: { userId, tripId, kind: "change", emailStatus: "queued" }, data: { emailStatus: "cancelled", nextAttemptAt: null } });
  });
}

export async function nextChangeEmailAt() {
  return (await prisma.tripNotification.findFirst({ where: { emailStatus: "queued" }, orderBy: { nextAttemptAt: "asc" }, select: { nextAttemptAt: true } }))?.nextAttemptAt ?? null;
}

/** One message per alarm limits provider traffic; durable retries stay within its 24h idempotency window. */
export async function sendNextChangeEmail(send = sendEmail) {
  const n = await prisma.tripNotification.findFirst({ where: { emailStatus: "queued", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" } });
  if (!n) return;
  const member = await prisma.tripMembership.findUnique({ where: { tripId_userId: { tripId: n.tripId, userId: n.userId } }, include: { user: true } });
  const pref = await prisma.notificationPreference.findUnique({ where: { userId_tripId: { userId: n.userId, tripId: n.tripId } } });
  const enabled = n.kind === "event_email" ? pref?.emailEnabled && (await getTripPlan(n.tripId)).premium : n.kind === "booking_reminder" ? pref?.bookingReminderEmailEnabled && await bookingReminderStillRelevant(n.auditId) : pref?.changeEmailEnabled;
  if (!member || member.user.suspendedAt || !enabled || !member.user.emailVerified || member.user.email !== n.emailTo) {
    await prisma.tripNotification.update({ where: { id: n.id }, data: { emailStatus: "cancelled", nextAttemptAt: null } });
    return;
  }
  if (n.firstAttemptAt && Date.now() - n.firstAttemptAt.getTime() > 20 * 3600_000) {
    await prisma.tripNotification.update({ where: { id: n.id }, data: { emailStatus: "failed", nextAttemptAt: null, error: "Email retry window expired." } });
    return;
  }
  // The durable worker is the sole consumer. Persist the attempt before the network call.
  const attempts = n.attempts + 1;
  await prisma.tripNotification.update({ where: { id: n.id }, data: { attempts, firstAttemptAt: n.firstAttemptAt ?? new Date() } });
  const result = await send({ to: n.emailTo!, subject: n.emailSubject!, text: n.emailText!, idempotencyKey: `${n.kind === "event_email" ? "trip-events" : "trip-change"}/${n.id}` });
  if (result.status === "sent") {
    await prisma.tripNotification.updateMany({ where: { id: n.id, emailStatus: "queued" }, data: { emailStatus: "sent", providerId: result.providerId, nextAttemptAt: null, error: null } });
  } else {
    const retry = attempts < 6 && (result.status === "not_configured" || result.retryable !== false);
    await prisma.tripNotification.updateMany({ where: { id: n.id, emailStatus: "queued" }, data: {
      emailStatus: retry ? "queued" : "failed", nextAttemptAt: retry ? new Date(Date.now() + Math.max(result.status === "failed" ? result.retryAfterMs ?? 0 : 0, 30_000 * 2 ** (attempts - 1))) : null,
      error: result.status === "failed" ? result.error : "Email delivery is not configured.",
    } });
  }
}

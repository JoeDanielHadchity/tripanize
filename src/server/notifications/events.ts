import { createHash } from "node:crypto";
import { prisma, type Tx } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { getTripPlan } from "@/server/plans/access";
import { addDays, todayIn, zonedToUtc } from "@/lib/dates";
import type { EventChange } from "@/server/events/service";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 40);
type Line = { key: string; type: string; text: string; eventId: string };
const origin = () => (currentRuntime().appUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const emailBody = (name: string, lines: string[], tripId: string) => `Event matches for ${name}\n\n${lines.map(l => `• ${l}`).join("\n\n")}\n\nView events and booking links:\n${origin()}/trips/${tripId}/events\n\nYou enabled event emails for this trip. Manage your alerts:\n${origin()}/trips/${tripId}/events`;
function nextDigest(timezone: string, now: Date) {
  const today = todayIn(timezone, now), at = zonedToUtc(`${today}T09:00`, timezone);
  return at > now ? at : zonedToUtc(`${addDays(today, 1)}T09:00`, timezone);
}

/** Runs in the SAME transaction as event upserts: a saved match cannot lose its
 * notification to a restart. Email is an immutable outbox item, not a network call.
 */
export async function queueEventNotifications(tx: Tx, tripId: string, runId: string, newEvents: { id: string; title: string }[], changed: { id: string; title: string; changes: EventChange[] }[], now = new Date()) {
  if (!(await getTripPlan(tripId, tx)).premium) return;
  const trip = await tx.trip.findUniqueOrThrow({ where: { id: tripId }, select: { name: true, timezone: true } });
  const events = await tx.tripEvent.findMany({ where: { tripId, id: { in: [...newEvents.map(e => e.id), ...changed.map(e => e.id)] }, status: { not: "HIDDEN" } } });
  const today = todayIn(trip.timezone, now);
  const lines: Line[] = [];
  for (const event of events) {
    if (newEvents.some(e => e.id === event.id) && !event.cancelled && !event.soldOut && (!event.date || (event.endDate ?? event.date) >= today)) {
      lines.push({ key: `new:${event.id}`, type: "new", eventId: event.id, text: `New event: ${event.title}${event.date ? ` · ${event.date}` : " · date to confirm"}${event.city ? ` · ${event.city}` : ""}${event.whyFits ? `. ${event.whyFits}` : ""}`.slice(0, 750) });
    }
    const change = changed.find(e => e.id === event.id);
    if (change) for (const c of change.changes) lines.push({ key: `${event.id}:${c.type}:${c.summary}:${c.at}`, type: c.type, eventId: event.id, text: `${event.title}: ${c.summary}`.slice(0, 750) });
  }
  if (!lines.length) return;
  const members = await tx.tripMembership.findMany({ where: { tripId }, include: { user: { select: { email: true, emailVerified: true } } } });
  const prefs = await tx.notificationPreference.findMany({ where: { tripId } });
  for (const line of lines) {
    const auditId = `event:${hash([tripId, line.key])}`;
    await tx.auditLog.upsert({ where: { id: auditId }, create: { id: auditId, tripId, entity: "event_discovery", entityId: line.eventId, action: line.type, after: { summary: line.text } }, update: {} });
    for (const member of members) await tx.tripNotification.upsert({ where: { userId_auditId: { userId: member.userId, auditId } }, create: { userId: member.userId, tripId, auditId, kind: "event", tripName: trip.name, summary: line.text, href: `/trips/${tripId}/events?event=${encodeURIComponent(line.eventId)}` }, update: {} });
  }
  for (const member of members) {
    const pref = prefs.find(p => p.userId === member.userId);
    if (!pref?.emailEnabled || !member.user.emailVerified) continue;
    const selected = lines.filter(l => pref.changeTypes.includes(l.type));
    if (!selected.length) continue;
    const emailLines = selected.map(l => l.text);
    const auditId = `event-email:${hash([runId, member.userId, selected.map(l => l.key)])}`;
    await tx.auditLog.upsert({ where: { id: auditId }, create: { id: auditId, tripId, entity: "event_email", entityId: runId, action: "queue", after: { lines: emailLines } }, update: {} });
    await tx.tripNotification.upsert({ where: { userId_auditId: { userId: member.userId, auditId } }, create: {
      userId: member.userId, tripId, auditId, kind: "event_email", tripName: trip.name, summary: `${emailLines.length} event update(s)`, href: `/trips/${tripId}/events`,
      emailTo: member.user.email, emailSubject: `Tripanize: ${emailLines.length} event update${emailLines.length === 1 ? "" : "s"} for ${trip.name.replace(/[\r\n]+/g, " ").slice(0, 90)}`,
      emailText: emailBody(trip.name, emailLines, tripId), emailStatus: pref.frequency === "daily" ? "digest" : "queued", nextAttemptAt: pref.frequency === "daily" ? nextDigest(trip.timezone, now) : now,
    }, update: {} });
  }
  await tx.trip.update({ where: { id: tripId }, data: { revision: { increment: 1 }, lastChangedById: null } });
  await currentRuntime().wakeNotifications?.();
}

/** Coalesce all ready batches into ONE immutable daily email per member/trip.
 * Staged rows are marked in the same transaction so restarts never duplicate a digest.
 */
export async function prepareEventDigests(now = new Date()) {
  await prisma.$transaction(async tx => {
    const ready = await tx.tripNotification.findMany({ where: { kind: "event_email", emailStatus: "digest", nextAttemptAt: { lte: now } }, include: { audit: { select: { after: true } } }, orderBy: { createdAt: "asc" }, take: 200 });
    const groups = new Map<string, typeof ready>();
    for (const n of ready) { const key = `${n.userId}:${n.tripId}`; groups.set(key, [...(groups.get(key) ?? []), n]); }
    for (const sample of groups.values()) {
      const first = sample[0];
      const batches = await tx.tripNotification.findMany({ where: { userId: first.userId, tripId: first.tripId, kind: "event_email", emailStatus: "digest", nextAttemptAt: { lte: now } }, include: { audit: { select: { after: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const ids = batches.map(n => n.id);
      const pref = await tx.notificationPreference.findUnique({ where: { userId_tripId: { userId: first.userId, tripId: first.tripId } } });
      const member = await tx.tripMembership.findUnique({ where: { tripId_userId: { tripId: first.tripId, userId: first.userId } }, include: { user: true } });
      if (!member || !pref?.emailEnabled || !member.user.emailVerified || member.user.email !== first.emailTo || !(await getTripPlan(first.tripId, tx)).premium) {
        for (let i = 0; i < ids.length; i += 50) await tx.tripNotification.updateMany({ where: { id: { in: ids.slice(i, i + 50) } }, data: { emailStatus: "cancelled", nextAttemptAt: null } }); continue;
      }
      const lines = [...new Set(batches.flatMap(n => {
        const data = n.audit.after as { lines?: unknown } | null;
        return Array.isArray(data?.lines) ? data.lines.filter((l): l is string => typeof l === "string") : [];
      }))];
      const auditId = `event-digest:${hash(ids)}`;
      await tx.auditLog.upsert({ where: { id: auditId }, create: { id: auditId, tripId: first.tripId, entity: "event_email", entityId: first.tripId, action: "digest" }, update: {} });
      await tx.tripNotification.upsert({ where: { userId_auditId: { userId: first.userId, auditId } }, create: {
        userId: first.userId, tripId: first.tripId, auditId, kind: "event_email", tripName: first.tripName, summary: "Daily event digest", href: first.href,
        emailTo: first.emailTo, emailSubject: `Tripanize: daily event matches for ${first.tripName.replace(/[\r\n]+/g, " ").slice(0, 90)}`, emailText: emailBody(first.tripName, lines, first.tripId), emailStatus: "queued", nextAttemptAt: now,
      }, update: {} });
      for (let i = 0; i < ids.length; i += 50) await tx.tripNotification.updateMany({ where: { id: { in: ids.slice(i, i + 50) }, emailStatus: "digest" }, data: { emailStatus: "batched", nextAttemptAt: null } });
      await tx.notificationPreference.update({ where: { id: pref.id }, data: { lastDigestAt: now } });
    }
  });
}

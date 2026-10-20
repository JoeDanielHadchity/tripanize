import { prisma } from "@/server/db";
import { sendEmail } from "./email";
import type { EventChange } from "@/server/events/service";

/**
 * Event-change notifications. Opt-in per member and trip; only selected change types; each change is delivered
 * at most once per user (dedupe key), and a delivery is recorded as "sent" only when the email provider accepted it.
 */
export async function notifyEventChanges(tripId: string, newEvents: { id: string; title: string }[], changed: { id: string; title: string; changes: EventChange[] }[]) {
  const prefs = await prisma.notificationPreference.findMany({ where: { tripId, emailEnabled: true }, include: { user: true } });
  if (!prefs.length) return;
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { name: true } });
  for (const p of prefs) {
    const member = await prisma.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId: p.userId } } });
    if (!member) continue;
    const lines: { key: string; text: string }[] = [];
    if (p.changeTypes.includes("new")) for (const e of newEvents) lines.push({ key: `new:${e.id}`, text: `New event: ${e.title}` });
    for (const c of changed) for (const ch of c.changes) if (p.changeTypes.includes(ch.type)) lines.push({ key: `${ch.type}:${c.id}:${ch.summary}`, text: `${c.title}: ${ch.summary}` });
    if (!lines.length) continue;
    if (p.frequency === "daily") {
      // Daily digests are assembled by the worker from pending changes; record them as queued.
      for (const l of lines) {
        await prisma.notificationDelivery.upsert({ where: { userId_dedupeKey: { userId: p.userId, dedupeKey: l.key } }, create: { userId: p.userId, tripId, channel: "email", subject: l.text.slice(0, 200), dedupeKey: l.key, status: "queued" }, update: {} });
      }
      continue;
    }
    await deliver(p.userId, p.user.email, tripId, trip.name, lines);
  }
}

async function deliver(userId: string, email: string, tripId: string, tripName: string, lines: { key: string; text: string }[]) {
  const already = await prisma.notificationDelivery.findMany({ where: { userId, dedupeKey: { in: lines.map((l) => l.key) }, status: "sent" }, select: { dedupeKey: true } });
  const fresh = lines.filter((l) => !already.some((a) => a.dedupeKey === l.key));
  if (!fresh.length) return;
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/trips/${tripId}/events`;
  const res = await sendEmail({ to: email, subject: `Event updates for “${tripName}”`, text: `${fresh.map((l) => `• ${l.text}`).join("\n")}\n\nReview them in Roam: ${url}\n\nYou receive this because you turned on event alerts for this trip.` });
  const status = res.status === "sent" ? "sent" : res.status === "not_configured" ? "not_configured" : "failed";
  for (const l of fresh) {
    await prisma.notificationDelivery.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey: l.key } },
      create: { userId, tripId, channel: "email", subject: l.text.slice(0, 200), dedupeKey: l.key, status, providerId: res.status === "sent" ? res.providerId : null, error: res.status === "failed" ? res.error : null },
      update: { status, providerId: res.status === "sent" ? res.providerId : null, error: res.status === "failed" ? res.error : null },
    });
  }
}

/** Sends queued daily digests (once per 24h per user/trip). */
export async function sendDailyDigests() {
  const prefs = await prisma.notificationPreference.findMany({ where: { emailEnabled: true, frequency: "daily", OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date(Date.now() - 23 * 3600_000) } }] }, include: { user: true, trip: { select: { name: true } } } });
  for (const p of prefs) {
    const queued = await prisma.notificationDelivery.findMany({ where: { userId: p.userId, tripId: p.tripId, status: { in: ["queued", "not_configured", "failed"] } } });
    if (!queued.length) continue;
    await deliver(p.userId, p.user.email, p.tripId, p.trip.name, queued.map((q) => ({ key: q.dedupeKey, text: q.subject })));
    await prisma.notificationPreference.update({ where: { id: p.id }, data: { lastDigestAt: new Date() } });
  }
}

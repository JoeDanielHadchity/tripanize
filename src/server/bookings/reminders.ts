import { createHash } from "node:crypto";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { emailConfigured } from "@/server/notifications/email";
import { isDateStr, isTimeStr, zonedToUtc, formatTimestamp } from "@/lib/dates";

type DeadlineKind = "bookByAt" | "paymentDueAt" | "freeCancellationAt";
const kinds: DeadlineKind[] = ["bookByAt", "paymentDueAt", "freeCancellationAt"];
const labels: Record<DeadlineKind, string> = { bookByAt: "Booking deadline", paymentDueAt: "Payment deadline", freeCancellationAt: "Free cancellation deadline" };
type BookingDeadlines = { status: string; bookByAt: string | null; paymentDueAt: string | null; freeCancellationAt: string | null };
export function deadlineInstant(local: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local) || !isDateStr(local.slice(0, 10)) || !isTimeStr(local.slice(11))) throw new AppError("VALIDATION", "Enter a valid deadline date and time.");
  const result = zonedToUtc(local, timezone);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(result);
  const p = (t: string) => parts.find(v => v.type === t)?.value;
  if (`${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}` !== local) throw new AppError("VALIDATION", "This deadline time doesn't exist in the trip time zone. Choose another time.");
  return result;
}
function relevant(b: BookingDeadlines, kind: DeadlineKind) {
  return kind === "bookByAt" ? ["IDEA", "TO_BOOK", "REQUESTED"].includes(b.status) : kind === "paymentDueAt" ? !["PAID", "CANCELLED"].includes(b.status) : ["BOOKED", "PAID"].includes(b.status);
}
async function candidates() {
  return prisma.booking.findMany({ where: { status: { not: "CANCELLED" }, OR: kinds.map(k => ({ [k]: { not: null } })), AND: [{ OR: [{ eventId: null }, { event: { status: { not: "HIDDEN" }, cancelled: false } }] }] }, include: { trip: { select: { name: true, timezone: true } } } });
}
const hash = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 40);
export async function nextBookingReminderAt(now = new Date()) {
  let next: Date | null = null;
  for (const b of await candidates()) for (const kind of kinds) if (b[kind] && relevant(b, kind)) {
    let deadline: Date;
    try { deadline = deadlineInstant(b[kind]!, b.trip.timezone); } catch { continue; }
    for (const hours of [24, 0]) {
      const at = new Date(deadline.getTime() - hours * 3600_000);
      if (at > now && (!next || at < next)) next = at;
    }
  }
  return next;
}

/** Same immutable notification outbox and retry mechanism as shared trip changes. */
export async function queueDueBookingReminders(now = new Date()) {
  let queued = 0;
  for (const b of await candidates()) for (const kind of kinds) if (b[kind] && relevant(b, kind)) {
    let deadline: Date;
    try { deadline = deadlineInstant(b[kind]!, b.trip.timezone); } catch { continue; }
    // Only the current reminder window is sent. A restart never floods past deadlines.
    const hours = now < deadline ? 24 : 0;
    const at = new Date(deadline.getTime() - hours * 3600_000);
    if (at > now || now.getTime() >= deadline.getTime() + 24 * 3600_000) continue;
    const auditId = `booking-reminder:${hash([b.id, kind, b[kind], b.trip.timezone, hours])}`;
    await prisma.$transaction(async tx => {
      const fresh = await tx.booking.findUnique({ where: { id: b.id }, include: { trip: { select: { timezone: true } }, event: { select: { status: true, cancelled: true } } } });
      if (!fresh || fresh[kind] !== b[kind] || fresh.trip.timezone !== b.trip.timezone || !relevant(fresh, kind) || fresh.event?.status === "HIDDEN" || fresh.event?.cancelled) return;
      if (await tx.auditLog.findUnique({ where: { id: auditId } })) return;
      const summary = `${labels[kind]} ${hours ? "in 24 hours or less" : "reached"}: ${b.title}. ${formatTimestamp(deadline, b.trip.timezone)}.`.slice(0, 750);
      const payload = { bookingId: b.id, kind, local: b[kind], timezone: b.trip.timezone, hours };
      await tx.auditLog.create({ data: { id: auditId, tripId: b.tripId, entity: "booking_reminder", entityId: b.id, action: "due", after: payload, createdAt: now } });
      const members = await tx.tripMembership.findMany({ where: { tripId: b.tripId, user: { suspendedAt: null } }, include: { user: { select: { email: true, emailVerified: true } } } });
      const prefs = await tx.notificationPreference.findMany({ where: { tripId: b.tripId, bookingReminderEmailEnabled: true } });
      const href = `/trips/${b.tripId}/bookings#b-${b.id}`;
      const origin = (currentRuntime().appUrl ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
      for (const m of members) {
        const email = m.user.emailVerified && prefs.some(p => p.userId === m.userId);
        await tx.tripNotification.create({ data: { userId: m.userId, tripId: b.tripId, auditId, kind: "booking_reminder", tripName: b.trip.name, summary, href,
          ...(email ? { emailTo: m.user.email, emailSubject: `Tripanize: ${labels[kind].toLowerCase()} reminder`, emailText: `${summary}\n\nTrip: ${b.trip.name}\n\nReview the booking:\n${origin}${href}\n\nChange your booking reminder email preference:\n${origin}/trips/${b.tripId}/bookings`, emailStatus: "queued", nextAttemptAt: now } : {}),
        } });
      }
      await tx.trip.update({ where: { id: b.tripId }, data: { revision: { increment: 1 }, lastChangedById: null } });
      queued++;
    });
  }
  if (queued) await currentRuntime().wakeNotifications?.();
  return queued;
}

/** Recheck after every retry: paid, cancelled, removed or rescheduled items must not send stale emails. */
export async function bookingReminderStillRelevant(auditId: string, now = new Date()) {
  const audit = await prisma.auditLog.findUnique({ where: { id: auditId } });
  const p = audit?.after as { bookingId?: string; kind?: DeadlineKind; local?: string; timezone?: string; hours?: number } | null;
  if (!p?.bookingId || !p.kind || !kinds.includes(p.kind)) return false;
  const b = await prisma.booking.findUnique({ where: { id: p.bookingId }, include: { trip: { select: { timezone: true } }, event: { select: { status: true, cancelled: true } } } });
  if (!b || !relevant(b, p.kind) || b[p.kind] !== p.local || b.trip.timezone !== p.timezone || b.event?.status === "HIDDEN" || b.event?.cancelled) return false;
  const deadline = deadlineInstant(b[p.kind]!, b.trip.timezone);
  return p.hours === 24 ? now < deadline && now.getTime() >= deadline.getTime() - 24 * 3600_000 : now >= deadline && now.getTime() < deadline.getTime() + 24 * 3600_000;
}
export async function setBookingReminderPreference(userId: string, tripId: string, enabled: boolean) {
  await requireTrip(tripId, userId);
  if (typeof enabled !== "boolean") throw new AppError("VALIDATION", "Choose whether to receive reminders.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (enabled && !user.emailVerified) throw new AppError("VALIDATION", "Verify your email before enabling reminder emails.");
  if (enabled && !emailConfigured()) throw new AppError("NOT_CONFIGURED", "Email delivery is unavailable. In-app reminders are still on.");
  await prisma.$transaction(async tx => {
    await tx.notificationPreference.upsert({ where: { userId_tripId: { userId, tripId } }, create: { userId, tripId, bookingReminderEmailEnabled: enabled }, update: { bookingReminderEmailEnabled: enabled } });
    if (!enabled) await tx.tripNotification.updateMany({ where: { userId, tripId, kind: "booking_reminder", emailStatus: "queued" }, data: { emailStatus: "cancelled", nextAttemptAt: null } });
  });
}

import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError, conflictError } from "@/server/errors";
import { requireCompanyAdmin, isCompanyIdentity } from "./identity";
import { adminAudit } from "./audit";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { billingEnvironment } from "@/server/billing/config";
import { reconcilePayment } from "@/server/billing/service";
import { getTripPlan } from "@/server/plans/access";
import { aiConfigured } from "@/server/ai/openai";
import { emailConfigured } from "@/server/notifications/email";
import { supportConfigured } from "@/server/support/service";
import { rateLimit } from "@/server/ratelimit";

const id = z.string().min(1).max(80);
const limit = z.number().int().min(1).max(100000).nullable();
const rate = z.number().finite().min(0).max(10000).nullable();
const time = z.iso.datetime({ offset: true });
export const adminCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("user.suspend"), id, suspended: z.boolean(), reason: z.string().trim().max(200) }).strict(),
  z.object({ op: z.literal("trial.expiry"), id, endsAt: time.nullable() }).strict(),
  z.object({ op: z.literal("support.update"), id, status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]), note: z.string().trim().max(2000) }).strict(),
  z.object({ op: z.literal("announcement.create"), title: z.string().trim().min(1).max(100), message: z.string().trim().min(1).max(1000), tone: z.enum(["info", "maintenance"]), startsAt: time, endsAt: time.nullable() }).strict(),
  z.object({ op: z.literal("announcement.status"), id, version: z.number().int().positive(), status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]) }).strict(),
  z.object({ op: z.literal("ai.settings"), aiPaused: z.boolean(), aiDailyLimit: limit, aiUserDailyLimit: limit, pricingModel: z.string().trim().max(100).nullable(), inputUsdPerMillion: rate, outputUsdPerMillion: rate, searchUsdPerThousand: rate }).strict(),
  z.object({ op: z.literal("payment.sync"), id }).strict(),
  z.object({ op: z.literal("health.wake") }).strict(),
]);
export type AdminCommand = z.input<typeof adminCommand>;

export async function executeAdminCommand(actorId: string, input: unknown) {
  await requireCompanyAdmin(actorId);
  const parsed = adminCommand.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Check the fields and try again.");
  const c = parsed.data;
  await rateLimit(`admin:${actorId}`, 120, 3600);
  if (c.op === "payment.sync") {
    const checkout = await prisma.premiumCheckout.findFirst({ where: { id: c.id, environment: billingEnvironment() } });
    if (!checkout?.transactionId) throw new AppError("NOT_FOUND", "This purchase has no provider transaction to refresh.");
    await rateLimit(`admin-payment:${checkout.id}`, 6, 300);
    await reconcilePayment(checkout.transactionId);
    await adminAudit(actorId, c.op, "payment", c.id);
    return;
  }
  if (c.op === "health.wake") {
    await currentRuntime().wakeAi?.();
    await adminAudit(actorId, c.op, "platform", "queue");
    return;
  }
  await prisma.$transaction(async tx => {
    await requireCompanyAdmin(actorId, tx);
    switch (c.op) {
      case "user.suspend": {
        const user = await tx.user.findUnique({ where: { id: c.id } });
        if (!user) throw new AppError("NOT_FOUND", "Account not found.");
        if (isCompanyIdentity(user) || user.id === actorId) throw new AppError("FORBIDDEN", "The administrator account cannot be suspended.");
        await tx.user.update({ where: { id: c.id }, data: { suspendedAt: c.suspended ? new Date() : null, suspensionReason: c.suspended ? c.reason || "Suspended by the administrator" : null } });
        if (c.suspended) {
          await tx.session.deleteMany({ where: { userId: c.id } });
          // Remove any currently shared location when account access is stopped.
          await tx.memberLocation.updateMany({ where: { membership: { userId: c.id } }, data: { lat: null, lng: null, accuracy: null, expiresAt: null, leaseHash: null, sessionId: null, version: { increment: 1 } } });
        }
        await adminAudit(actorId, c.suspended ? "user.suspended" : "user.restored", "user", c.id, { reason: c.reason }, tx);
        break;
      }
      case "trial.expiry": {
        const trial = await tx.trialInvitation.findUnique({ where: { id: c.id } });
        if (!trial?.acceptedAt || trial.revokedAt) throw new AppError("CONFLICT", "Choose an accepted trial that has not been revoked.");
        const endsAt = c.endsAt ? new Date(c.endsAt) : null;
        if (endsAt && endsAt.getTime() <= Date.now()) throw new AppError("VALIDATION", "Choose a future expiry, or revoke the trial to end it now.");
        await tx.trialInvitation.update({ where: { id: c.id }, data: { trialEndsAt: endsAt } });
        await adminAudit(actorId, c.op, "trial", c.id, { endsAt: c.endsAt }, tx);
        break;
      }
      case "support.update": {
        if (!await tx.supportRequest.findUnique({ where: { id: c.id } })) throw new AppError("NOT_FOUND", "Support request not found.");
        await tx.supportRequest.update({ where: { id: c.id }, data: { status: c.status, note: c.note } });
        await adminAudit(actorId, c.op, "support", c.id, { status: c.status }, tx);
        break;
      }
      case "announcement.create": {
        if (c.endsAt && new Date(c.endsAt) <= new Date(c.startsAt)) throw new AppError("VALIDATION", "The end must be after the start.");
        const announcement = await tx.announcement.create({ data: { title: c.title, message: c.message, tone: c.tone, startsAt: new Date(c.startsAt), endsAt: c.endsAt ? new Date(c.endsAt) : null } });
        await adminAudit(actorId, c.op, "announcement", announcement.id, {}, tx);
        break;
      }
      case "announcement.status": {
        const saved = await tx.announcement.updateMany({ where: { id: c.id, version: c.version }, data: { status: c.status, version: { increment: 1 } } });
        if (!saved.count) throw conflictError("This announcement");
        await adminAudit(actorId, c.op, "announcement", c.id, { status: c.status }, tx);
        break;
      }
      case "ai.settings": {
        const { op: _op, ...values } = c;
        if ((values.inputUsdPerMillion !== null || values.outputUsdPerMillion !== null) && !values.pricingModel) throw new AppError("VALIDATION", "Enter the model these token rates apply to.");
        await tx.platformSettings.upsert({ where: { id: "platform" }, create: { id: "platform", ...values }, update: values });
        await adminAudit(actorId, c.op, "platform", "ai", values, tx);
        break;
      }
    }
  });
}

export async function adminOverview(actorId: string) {
  await requireCompanyAdmin(actorId);
  const since = new Date(Date.now() - 30 * 86400_000);
  const env = billingEnvironment();
  const [users, activeUsers, suspended, trips, verifiedPurchases, pendingPayments, sales, trials, trialPurchases, openSupport, aiRequests, failedAi, unpricedAi] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { lastSeenAt: { gte: since } } }), prisma.user.count({ where: { suspendedAt: { not: null } } }), prisma.trip.count(),
    prisma.premiumCheckout.count({ where: { environment: env, status: "COMPLETED", reviewRequired: false } }),
    prisma.premiumCheckout.count({ where: { environment: env, status: { in: ["PENDING", "CREATING"] } } }),
    prisma.premiumCheckout.aggregate({ where: { environment: env, status: "COMPLETED", reviewRequired: false }, _sum: { amountMinor: true } }),
    prisma.trialInvitation.count({ where: { acceptedAt: { not: null } } }),
    prisma.trialInvitation.count({ where: { acceptedAt: { not: null }, trip: { premiumCheckouts: { some: { environment: env, status: "COMPLETED", reviewRequired: false } } } } }),
    prisma.supportRequest.count({ where: { status: { not: "RESOLVED" } } }), prisma.aiUsage.count({ where: { createdAt: { gte: since } } }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
    prisma.aiUsage.count({ where: { createdAt: { gte: since }, inputTokens: { not: null }, estimatedCostMicros: null } }),
  ]);
  return { users, activeUsers, suspended, trips, verifiedPurchases, pendingPayments, salesMinor: sales._sum.amountMinor ?? 0, trials, trialPurchases, openSupport, aiRequests, failedAi, unpricedAi, environment: env };
}
const search = (q: string) => q.trim().slice(0, 100);
export async function adminUsers(actorId: string, q: string, page: number) {
  await requireCompanyAdmin(actorId);
  const term = search(q);
  // Literal substring matching avoids Durable Object SQLite's short LIKE-pattern limit.
  const [counts, ids] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*) AS total FROM "user" WHERE instr(lower("name"), lower(${term})) > 0 OR instr(lower("email"), lower(${term})) > 0`,
    prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "user" WHERE instr(lower("name"), lower(${term})) > 0 OR instr(lower("email"), lower(${term})) > 0 ORDER BY "createdAt" DESC, "id" DESC LIMIT 25 OFFSET ${page * 25}`,
  ]);
  const total = Number(counts[0]?.total ?? 0);
  const rows = await prisma.user.findMany({ where: { id: { in: ids.map(u => u.id) } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, name: true, email: true, emailVerified: true, createdAt: true, lastSeenAt: true, suspendedAt: true, suspensionReason: true, _count: { select: { ownedTrips: true, memberships: true } } } });
  return { total, rows: rows.map(u => ({ ...u, administrator: isCompanyIdentity(u) })) };
}
export async function adminTrips(actorId: string, q: string, page: number) {
  await requireCompanyAdmin(actorId);
  const term = search(q);
  const [counts, ids] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*) AS total FROM "Trip" t JOIN "user" u ON u."id" = t."ownerId" WHERE instr(lower(t."name"), lower(${term})) > 0 OR instr(lower(u."email"), lower(${term})) > 0 OR EXISTS (SELECT 1 FROM "Destination" d WHERE d."tripId" = t."id" AND instr(lower(d."name"), lower(${term})) > 0)`,
    prisma.$queryRaw<{ id: string }[]>`SELECT t."id" FROM "Trip" t JOIN "user" u ON u."id" = t."ownerId" WHERE instr(lower(t."name"), lower(${term})) > 0 OR instr(lower(u."email"), lower(${term})) > 0 OR EXISTS (SELECT 1 FROM "Destination" d WHERE d."tripId" = t."id" AND instr(lower(d."name"), lower(${term})) > 0) ORDER BY t."createdAt" DESC, t."id" DESC LIMIT 25 OFFSET ${page * 25}`,
  ]);
  const total = Number(counts[0]?.total ?? 0);
  const rows = await prisma.trip.findMany({ where: { id: { in: ids.map(t => t.id) } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, name: true, createdAt: true, startDate: true, endDate: true, owner: { select: { email: true } }, destinations: { select: { name: true } }, _count: { select: { memberships: true } } } });
  const data = [];
  for (const row of rows) { const plan = await getTripPlan(row.id); data.push({ ...row, plan: plan.premium ? "Premium" : "Normal", source: plan.source, people: plan.people }); }
  return { total, rows: data };
}
export async function adminPayments(actorId: string, page: number) {
  await requireCompanyAdmin(actorId);
  const where = { environment: billingEnvironment() };
  const [total, rows] = await Promise.all([prisma.premiumCheckout.count({ where }), prisma.premiumCheckout.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 25, take: 25, include: { trip: { select: { name: true } } } })]);
  const buyers = await prisma.user.findMany({ where: { id: { in: rows.map(r => r.buyerId) } }, select: { id: true, email: true } });
  return { total, rows: rows.map(r => ({ ...r, buyerEmail: buyers.find(u => u.id === r.buyerId)?.email ?? null })) };
}
export async function adminAi(actorId: string) {
  await requireCompanyAdmin(actorId);
  const where = { createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } };
  const [settings, totals, unknownCosts, rows] = await Promise.all([
    prisma.platformSettings.findUnique({ where: { id: "platform" } }),
    prisma.aiUsage.aggregate({ where, _count: true, _sum: { inputTokens: true, outputTokens: true, searchCalls: true, estimatedCostMicros: true } }),
    prisma.aiUsage.count({ where: { ...where, inputTokens: { not: null }, estimatedCostMicros: null } }),
    prisma.aiUsage.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 40 }),
  ]);
  return { settings, totals, unknownCosts, rows };
}
export async function adminSupport(actorId: string, page: number) {
  await requireCompanyAdmin(actorId);
  const [total, rows] = await Promise.all([prisma.supportRequest.count(), prisma.supportRequest.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 20, take: 20 })]);
  return { total, rows };
}
export async function adminHealth(actorId: string) {
  await requireCompanyAdmin(actorId);
  const [jobs, discoveries, searches, emails, trialEmails, webhooks] = await Promise.all([
    prisma.generationJob.findMany({ where: { status: { in: ["FAILED", "QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, kind: true, status: true, errorCode: true, createdAt: true, startedAt: true } }),
    prisma.discoveryRun.findMany({ where: { status: { in: ["failed", "queued", "running"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, createdAt: true } }),
    prisma.destinationSearch.findMany({ where: { deletedAt: null, status: { in: ["FAILED", "QUEUED", "RUNNING"] } }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, createdAt: true } }),
    prisma.tripNotification.count({ where: { emailStatus: { in: ["failed", "queued"] } } }),
    prisma.trialInvitation.count({ where: { emailStatus: { in: ["failed", "queued", "not_configured"] } } }),
    prisma.billingDelivery.findMany({ where: { environment: billingEnvironment() }, orderBy: { updatedAt: "desc" }, take: 30 }),
  ]);
  return { jobs, discoveries, searches, emails, trialEmails, webhooks, aiConfigured: aiConfigured(), emailConfigured: emailConfigured(), supportConfigured: supportConfigured(), paddleConfigured: Boolean(currentRuntime().paddle?.apiKey && currentRuntime().paddle?.webhookSecret), environment: billingEnvironment() };
}
export async function adminAnnouncements(actorId: string) {
  await requireCompanyAdmin(actorId);
  return prisma.announcement.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
}
export async function adminActivity(actorId: string, page: number) {
  await requireCompanyAdmin(actorId);
  const [total, rows] = await Promise.all([prisma.adminAudit.count(), prisma.adminAudit.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: page * 30, take: 30 })]);
  return { total, rows };
}
export async function activeAnnouncements(now = new Date()) {
  return prisma.announcement.findMany({ where: { status: "PUBLISHED", startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, orderBy: { startsAt: "desc" }, take: 3, select: { id: true, title: true, message: true, tone: true } });
}

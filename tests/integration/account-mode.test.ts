import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { appRuntime, currentRuntime, normalUserMode, setTestRuntime } from "@/server/cloudflare/runtime";
import { sessionAccountMode, setAccountMode } from "@/server/admin/mode";
import { companyAccount, requireCompanyAdmin } from "@/server/admin/identity";
import { adminOverview } from "@/server/admin/operations";
import { getTripPlan, requirePremiumTrip } from "@/server/plans/access";
import { PREMIUM_FEATURE_KEYS } from "@/lib/plans";
import { planningScope } from "@/server/plans/planning";
import { billingSummary } from "@/server/billing/service";
import { enqueueJob } from "@/server/planner/jobs";
import { claimJob, runJob, type Generator } from "@/server/planner/run";
import type { Proposal } from "@/server/planner/schema";
import { makeTrip, makeUser, resetDb } from "./helpers";
const base = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...base, planAccessEnabled: true, companyAdminEmail: "company@example.test" }); });
afterEach(() => { setTestRuntime(base); vi.unstubAllEnvs(); });
async function fixture() {
  const admin = await makeUser("Tripanize.app", "company@example.test"), other = await makeUser("Member");
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: true } });
  const a = await prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: admin.id, expiresAt: new Date(Date.now() + 86400_000) } });
  const b = await prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: admin.id, expiresAt: new Date(Date.now() + 86400_000) } });
  await prisma.session.updateMany({ where: { userId: admin.id }, data: { adminEmailUnlockedAt: new Date(), adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
  const tripId = await makeTrip(admin.id, { startDate: "2020-05-01", endDate: "2020-05-08", mustSee: [] });
  await prisma.destination.updateMany({ where: { tripId }, data: { lat: 38.7, lng: -9.1 } });
  await prisma.tripMembership.create({ data: { tripId, userId: other.id, role: "VIEWER" } });
  return { admin, other, a, b, tripId };
}
async function inSession<T>(userId: string, sessionId: string, action: () => Promise<T>) {
  const accountMode = await sessionAccountMode(userId, sessionId);
  return appRuntime.run({ ...currentRuntime(), accountMode }, action);
}
it("persists Normal only for the selected session and requires new authentication to return to Admin", async () => {
  const { admin, a, b } = await fixture();
  expect(await sessionAccountMode(admin.id, a.id)).toMatchObject({ normal: false, userId: admin.id });
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "NORMAL"));
  expect(await sessionAccountMode(admin.id, a.id)).toMatchObject({ normal: true });
  expect(await sessionAccountMode(admin.id, b.id)).toMatchObject({ normal: false });
  await inSession(admin.id, a.id, async () => { expect(normalUserMode(admin.id)).toBe(true); expect(await companyAccount(admin.id)).toBe(true); await expect(requireCompanyAdmin(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(adminOverview(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); await expect(setAccountMode(admin.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  expect((await prisma.session.findUniqueOrThrow({ where: { id: a.id } })).adminVerifiedUntil).toBeNull();
  // Simulate successful step-up; real admin email-code verification has its own suite.
  await prisma.session.update({ where: { id: a.id }, data: { normalMode: false, adminEmailUnlockedAt: new Date(), adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "ADMIN"));
  await inSession(admin.id, a.id, async () => { expect(normalUserMode()).toBe(false); await requireCompanyAdmin(admin.id); });
  expect((await prisma.adminAudit.findMany({ orderBy: { createdAt: "asc" } })).map(r => r.details)).toEqual([{ mode: "NORMAL" }, { mode: "ADMIN" }]);
});
it("keeps company Premium active in Normal mode without changing admin powers, payments or unrelated trips", async () => {
  const { admin, a, b, tripId } = await fixture();
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "NORMAL"));
  await inSession(admin.id, a.id, async () => {
    expect(await getTripPlan(tripId)).toMatchObject({ premium: true, preview: false, source: "company", creditMinor: 0, validUntil: null });
    expect(await planningScope(tripId, "full")).toBeNull();
    for (const feature of PREMIUM_FEATURE_KEYS) await requirePremiumTrip(tripId, admin.id, feature);
    expect((await billingSummary(admin.id, tripId)).options[0]).toMatchObject({ dueMinor: 0, eligible: false });
    await expect(adminOverview(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "company" });
  await inSession(admin.id, b.id, async () => expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "company" }));
  expect(await prisma.premiumCheckout.count()).toBe(0); expect(await prisma.tripMembership.count({ where: { tripId } })).toBe(2);
});
it("keeps legitimate purchases and does not let an expired trial limit permanent company Premium", async () => {
  const { admin, a, tripId } = await fixture();
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "NORMAL"));
  await prisma.premiumCheckout.create({ data: { tripId, buyerId: admin.id, environment: "live", priceId: "fixture", amountMinor: 1500, targetCapacity: 99, status: "COMPLETED" } });
  await inSession(admin.id, a.id, async () => { expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "purchase" }); await requirePremiumTrip(tripId, admin.id, "expenses"); });
  const trialTrip = await makeTrip(admin.id);
  await prisma.trialInvitation.create({ data: { email: admin.email, tokenHash: randomUUID(), createdById: admin.id, expiresAt: new Date(Date.now() - 86400_000), acceptedAt: new Date(Date.now() - 86400_000), acceptedById: admin.id, tripId: trialTrip, trialEndsAt: new Date(Date.now() - 1), emailText: "Fixture" } });
  await inSession(admin.id, a.id, async () => expect(await getTripPlan(trialTrip)).toMatchObject({ premium: true, source: "company", validUntil: null }));
});

it("includes all Premium features on owned and joined trips with expired admin proof while keeping member roles", async () => {
  const { admin, other, a, tripId } = await fixture();
  const joined = await makeTrip(other.id), unrelated = await makeTrip(other.id);
  await prisma.tripMembership.create({ data: { tripId: joined, userId: admin.id, role: "VIEWER" } });
  await prisma.session.update({ where: { id: a.id }, data: { adminVerifiedUntil: new Date(Date.now() - 1), adminEmailUnlockedAt: new Date(Date.now() - 3600_000) } });
  await inSession(admin.id, a.id, async () => {
    for (const id of [tripId, joined]) {
      expect(await getTripPlan(id)).toMatchObject({ premium: true, source: "company", validUntil: null });
      for (const feature of PREMIUM_FEATURE_KEYS) await requirePremiumTrip(id, admin.id, feature);
    }
    await expect(requirePremiumTrip(joined, admin.id, "expenses", "edit")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requirePremiumTrip(unrelated, admin.id, "expenses")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getTripPlan(unrelated)).premium).toBe(false);
    await expect(requireCompanyAdmin(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
it("rejects ordinary/unverified/suspended users, expired sessions, and another session owner's ID", async () => {
  const { admin, other, a } = await fixture();
  expect(await sessionAccountMode(other.id, a.id)).toBeUndefined();
  await expect(setAccountMode(other.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(setAccountMode(admin.id, "NORMAL")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await inSession(admin.id, a.id, () => expect(setAccountMode(admin.id, "FORGED" as "ADMIN")).rejects.toMatchObject({ code: "VALIDATION" }));
  await prisma.session.update({ where: { id: a.id }, data: { expiresAt: new Date(Date.now() - 1) } }); expect(await sessionAccountMode(admin.id, a.id)).toBeUndefined();
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: false } }); await expect(setAccountMode(admin.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: true, suspendedAt: new Date() } }); expect(await companyAccount(admin.id)).toBe(false); expect(await sessionAccountMode(admin.id, a.id)).toBeUndefined();
});
it("keeps full Premium planning for company jobs queued in Normal mode and still hides admin powers", async () => {
  const { admin, a, tripId } = await fixture(); vi.stubEnv("OPENAI_API_KEY", "isolated-fixture-no-real-calls");
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "NORMAL"));
  const job = await inSession(admin.id, a.id, () => enqueueJob(admin.id, tripId, "full", {}));
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.jobId } })).params).toMatchObject({ normalMode: true, dates: null });
  await prisma.session.update({ where: { id: a.id }, data: { normalMode: false, adminEmailUnlockedAt: new Date(), adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "ADMIN"));
  await claimJob(job.jobId);
  const inputs: string[][] = [];
  await runJob(job.jobId, (async (opts: { input: string; name: string }) => {
    expect(normalUserMode(admin.id)).toBe(true); expect(opts.name).toBe("trip_plan");
    await expect(requireCompanyAdmin(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const data = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]); inputs.push(data.datesToPlan);
    const proposal: Proposal = { summary: "Fixture", generalNotes: [], unplacedMustSees: [], days: data.datesToPlan.map((date: string) => ({ date, title: "Explore", area: "Lisbon", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null })) };
    return { data: proposal, model: "fixture", sources: [], usage: null };
  }) as Generator);
  expect(inputs.flat()).toEqual(["2020-05-01", "2020-05-02", "2020-05-03", "2020-05-04", "2020-05-05", "2020-05-06", "2020-05-07", "2020-05-08"]);
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.jobId } })).status).toBe("SUCCEEDED");
  expect(normalUserMode()).toBe(false);
});

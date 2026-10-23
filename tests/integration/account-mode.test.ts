import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { appRuntime, currentRuntime, normalUserMode, setTestRuntime } from "@/server/cloudflare/runtime";
import { sessionAccountMode, setAccountMode } from "@/server/admin/mode";
import { companyAccount, requireCompanyAdmin } from "@/server/admin/identity";
import { adminOverview } from "@/server/admin/operations";
import { getTripPlan, requirePremiumTrip } from "@/server/plans/access";
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
  await prisma.adminAuthenticator.create({ data: { userId: admin.id, encryptedSecret: "isolated-admin-feature-fixture", enabledAt: new Date() } });
  await prisma.session.updateMany({ where: { userId: admin.id }, data: { adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
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
  // Simulate successful step-up; real authenticator verification has its own suite.
  await prisma.session.update({ where: { id: a.id }, data: { normalMode: false, adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "ADMIN"));
  await inSession(admin.id, a.id, async () => { expect(normalUserMode()).toBe(false); await requireCompanyAdmin(admin.id); });
  expect((await prisma.adminAudit.findMany({ orderBy: { createdAt: "asc" } })).map(r => r.details)).toEqual([{ mode: "NORMAL" }, { mode: "ADMIN" }]);
});
it("applies real Normal limits to this view without altering shared grants, payments or background access", async () => {
  const { admin, a, b, tripId } = await fixture();
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "NORMAL"));
  await inSession(admin.id, a.id, async () => {
    expect(await getTripPlan(tripId)).toMatchObject({ premium: false, preview: false, source: null, creditMinor: 0 });
    expect(await planningScope(tripId, "full")).toEqual(["2020-05-01", "2020-05-02"]);
    await expect(requirePremiumTrip(tripId, admin.id, "expenses")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requirePremiumTrip(tripId, admin.id, "chat")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await billingSummary(admin.id, tripId)).options[0]).toMatchObject({ dueMinor: 1500, eligible: true });
  });
  expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "company" });
  await inSession(admin.id, b.id, async () => expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "company" }));
  expect(await prisma.premiumCheckout.count()).toBe(0); expect(await prisma.tripMembership.count({ where: { tripId } })).toBe(2);
});
it("keeps legitimate paid Premium and valid trial access in Normal mode", async () => {
  const { admin, a, tripId } = await fixture();
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "NORMAL"));
  await prisma.premiumCheckout.create({ data: { tripId, buyerId: admin.id, environment: "live", priceId: "fixture", amountMinor: 1500, targetCapacity: 99, status: "COMPLETED" } });
  await inSession(admin.id, a.id, async () => { expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "purchase" }); await requirePremiumTrip(tripId, admin.id, "expenses"); });
  const trialTrip = await makeTrip(admin.id);
  await prisma.trialInvitation.create({ data: { email: admin.email, tokenHash: randomUUID(), createdById: admin.id, expiresAt: new Date(Date.now() + 86400_000), acceptedAt: new Date(), acceptedById: admin.id, tripId: trialTrip, trialEndsAt: new Date(Date.now() + 86400_000), emailText: "Fixture" } });
  await inSession(admin.id, a.id, async () => expect(await getTripPlan(trialTrip)).toMatchObject({ premium: true, source: "trial" }));
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
it("keeps the two-day Normal scope for durable jobs even after returning to Admin", async () => {
  const { admin, a, tripId } = await fixture(); vi.stubEnv("OPENAI_API_KEY", "isolated-fixture-no-real-calls");
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "NORMAL"));
  const job = await inSession(admin.id, a.id, () => enqueueJob(admin.id, tripId, "full", {}));
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.jobId } })).params).toMatchObject({ normalMode: true, dates: ["2020-05-01", "2020-05-02"] });
  await prisma.session.update({ where: { id: a.id }, data: { normalMode: false, adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
  await inSession(admin.id, a.id, () => setAccountMode(admin.id, "ADMIN"));
  await claimJob(job.jobId);
  const inputs: string[][] = [];
  await runJob(job.jobId, (async (opts: { input: string; name: string }) => {
    expect(normalUserMode(admin.id)).toBe(true); expect(opts.name).toBe("trip_plan");
    const data = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]); inputs.push(data.datesToPlan);
    const proposal: Proposal = { summary: "Fixture", generalNotes: [], unplacedMustSees: [], days: data.datesToPlan.map((date: string) => ({ date, title: "Explore", area: "Lisbon", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null })) };
    return { data: proposal, model: "fixture", sources: [], usage: null };
  }) as Generator);
  expect(inputs).toEqual([["2020-05-01", "2020-05-02"]]);
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.jobId } })).status).toBe("SUCCEEDED");
  expect(normalUserMode()).toBe(false);
});

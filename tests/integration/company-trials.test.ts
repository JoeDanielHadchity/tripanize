import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { accountDisplayName, companyAccount, requireCompanyAdmin, normalizeCompanyIdentity } from "@/server/admin/identity";
import { createTrialInvitation, acceptTrialInvitation, listCompanyTrials, pendingTrialInvitations, previewTrialInvitation, revokeTrialInvitation, sendNextTrialEmail } from "@/server/admin/trials";
import { getTripPlan, requirePremiumTrip } from "@/server/plans/access";
import { billingSummary } from "@/server/billing/service";
import { planningScope } from "@/server/plans/planning";
import { createTripDraft, chooseNormal } from "@/server/trips/onboarding";
import { getExpenseData } from "@/server/expenses/service";
import { addStop } from "@/server/itinerary/service";
import { updateProfile } from "@/server/profile";
import { makeTrip, makeUser, resetDb, adminAuthenticationFixture } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true, appUrl: "https://tripanize.example.test", companyAdminEmail: "company@example.test" }); });
afterEach(() => { setTestRuntime(runtime); vi.restoreAllMocks(); });
async function fixture() {
  const admin = await makeUser("Retired personal label", "company@example.test");
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: true } });
  const recipient = await makeUser("Traveler", "traveler@example.test");
  await prisma.user.update({ where: { id: recipient.id }, data: { emailVerified: true } });
  const other = await makeUser("Other traveler");
  await adminAuthenticationFixture(admin.id);
  return { admin, recipient, other };
}
async function invitation(adminId: string, email: string) {
  const result = await createTrialInvitation(adminId, email);
  const token = new URL(result.url).pathname.split("/").pop()!;
  return { ...result, token };
}

it("restricts company authority to the exact verified account, regardless of display name", async () => {
  const f = await fixture();
  expect(await companyAccount(f.admin.id)).toBe(true);
  expect(await companyAccount(f.other.id)).toBe(false);
  await prisma.user.update({ where: { id: f.other.id }, data: { name: "Tripanize.app", emailVerified: true } });
  await expect(requireCompanyAdmin(f.other.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.user.update({ where: { id: f.admin.id }, data: { emailVerified: false } });
  await expect(createTrialInvitation(f.admin.id, f.recipient.email)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(listCompanyTrials(f.recipient.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(revokeTrialInvitation(f.recipient.id, "guessed-id")).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await prisma.trialInvitation.count()).toBe(0);
});

it("includes Premium on company trips and joined trips without overriding editing roles or creating payments", async () => {
  const f = await fixture();
  const own = await makeTrip(f.admin.id);
  const joined = await makeTrip(f.recipient.id);
  const privateTrip = await makeTrip(f.other.id);
  await prisma.tripMembership.create({ data: { tripId: joined, userId: f.admin.id, role: "VIEWER" } });
  expect(await getTripPlan(own)).toMatchObject({ premium: true, source: "company", creditMinor: 0 });
  expect(await getTripPlan(joined)).toMatchObject({ premium: true, source: "company" });
  expect((await getTripPlan(privateTrip)).premium).toBe(false);
  await expect(requirePremiumTrip(joined, f.admin.id, "expenses", "edit")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(requirePremiumTrip(privateTrip, f.admin.id, "expenses")).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await prisma.premiumCheckout.count()).toBe(0);
  expect(await prisma.premiumEntitlement.count()).toBe(0);
});

it("binds invitations to the verified recipient and hides them from other accounts", async () => {
  const f = await fixture();
  const inv = await invitation(f.admin.id, " TRAVELER@example.test ");
  expect(await previewTrialInvitation(inv.token)).toMatchObject({ id: inv.id, maskedEmail: "tr•••@example.test" });
  expect(await pendingTrialInvitations(f.other.id)).toEqual([]);
  await expect(acceptTrialInvitation(f.other.id, { invitationId: inv.id, name: "Wrong account" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.user.update({ where: { id: f.other.id }, data: { emailVerified: true } });
  await expect(acceptTrialInvitation(f.other.id, { invitationId: inv.id, name: "Wrong account" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  await prisma.user.update({ where: { id: f.recipient.id }, data: { emailVerified: false } });
  expect(await pendingTrialInvitations(f.recipient.id)).toEqual([]);
  await expect(acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, name: "Not verified" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await prisma.trip.count()).toBe(0);
});

it("unlocks exactly one existing owned trip for all members, without changing other prices or trips", async () => {
  const f = await fixture();
  const chosen = await makeTrip(f.recipient.id), another = await makeTrip(f.recipient.id);
  await prisma.tripMembership.create({ data: { tripId: chosen, userId: f.other.id, role: "VIEWER" } });
  const inv = await invitation(f.admin.id, f.recipient.email);
  await acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, tripId: chosen });
  expect(await getTripPlan(chosen)).toMatchObject({ premium: true, source: "trial", creditMinor: 0 });
  expect((await getTripPlan(another)).premium).toBe(false);
  expect(await planningScope(chosen, "full")).toBeNull();
  expect((await getExpenseData(f.other.id, chosen)).expenses).toEqual([]);
  const trial = await billingSummary(f.recipient.id, chosen), normal = await billingSummary(f.recipient.id, another);
  expect(trial.options[0]).toMatchObject({ eligible: false, dueMinor: 0 });
  expect(normal.options[0]).toMatchObject({ eligible: true, dueMinor: 1500 });
  expect(await prisma.premiumCheckout.count()).toBe(0);
  expect(await prisma.premiumEntitlement.count()).toBe(0);
  await expect(requireCompanyAdmin(f.recipient.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("creates a trial draft atomically and repeated claims cannot move the trial or create more trips", async () => {
  const f = await fixture();
  const inv = await invitation(f.admin.id, f.recipient.email);
  const first = await acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, name: "My trial" });
  const repeat = await acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, name: "A different trip" });
  expect(repeat.tripId).toBe(first.tripId);
  expect(await prisma.trip.count()).toBe(1);
  expect(await prisma.trip.findUnique({ where: { id: first.tripId } })).toMatchObject({ ownerId: f.recipient.id, onboardingStage: "DETAILS", onboardingPlan: "PREMIUM" });
  expect(await previewTrialInvitation(inv.token)).toBeNull();
  expect(await pendingTrialInvitations(f.recipient.id)).toEqual([]);
});

it("rejects a non-owner or already-Premium trip without consuming the invitation", async () => {
  const f = await fixture();
  const otherTrip = await makeTrip(f.other.id);
  const inv = await invitation(f.admin.id, f.recipient.email);
  await expect(acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, tripId: otherTrip })).rejects.toMatchObject({ code: "NOT_FOUND" });
  const own = await makeTrip(f.recipient.id);
  await prisma.premiumCheckout.create({ data: { tripId: own, buyerId: f.recipient.id, environment: "live", priceId: "test-price", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
  await expect(acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, tripId: own })).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await prisma.trialInvitation.findUniqueOrThrow({ where: { id: inv.id } })).acceptedAt).toBeNull();
  expect(await prisma.trip.count()).toBe(2);
});

it("allows one active invitation or trial per recipient and only the company can replace it", async () => {
  const f = await fixture();
  const inv = await invitation(f.admin.id, f.recipient.email);
  await expect(createTrialInvitation(f.admin.id, f.recipient.email)).rejects.toMatchObject({ code: "CONFLICT" });
  await acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, name: "My trial" });
  await expect(createTrialInvitation(f.admin.id, f.recipient.email)).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(revokeTrialInvitation(f.recipient.id, inv.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await revokeTrialInvitation(f.admin.id, inv.id);
  const next = await invitation(f.admin.id, f.recipient.email);
  expect(next.id).not.toBe(inv.id);
});

it("expires unused links, while a redeemed one-trip grant survives the invitation expiry date", async () => {
  const f = await fixture();
  const expired = await invitation(f.admin.id, f.recipient.email);
  await prisma.trialInvitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await previewTrialInvitation(expired.token)).toBeNull();
  await expect(acceptTrialInvitation(f.recipient.id, { invitationId: expired.id, name: "Too late" })).rejects.toMatchObject({ code: "CONFLICT" });
  const next = await invitation(f.admin.id, f.recipient.email);
  const claimed = await acceptTrialInvitation(f.recipient.id, { invitationId: next.id, name: "Trial trip" });
  await prisma.trialInvitation.update({ where: { id: next.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await getTripPlan(claimed.tripId)).premium).toBe(true);
});

it("revokes trial access while retaining saved content and leaving paid Premium intact", async () => {
  const f = await fixture();
  const tripId = await makeTrip(f.recipient.id);
  const inv = await invitation(f.admin.id, f.recipient.email);
  await acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, tripId });
  await addStop(f.recipient.id, tripId, { dayId: null, input: { title: "Keep this idea" } });
  await revokeTrialInvitation(f.admin.id, inv.id);
  expect((await getTripPlan(tripId)).premium).toBe(false);
  expect(await prisma.stop.count({ where: { tripId, title: "Keep this idea" } })).toBe(1);
  await prisma.premiumCheckout.create({ data: { tripId, buyerId: f.recipient.id, environment: "live", priceId: "test-price", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
  await revokeTrialInvitation(f.admin.id, inv.id);
  expect(await getTripPlan(tripId)).toMatchObject({ premium: true, source: "purchase" });
});

it("retries trial emails with the same immutable payload and idempotency key", async () => {
  const f = await fixture();
  const inv = await invitation(f.admin.id, f.recipient.email);
  const send = vi.fn().mockResolvedValueOnce({ status: "failed", error: "Transient", retryable: true }).mockResolvedValueOnce({ status: "sent", providerId: "stub-email" });
  const now = new Date();
  expect(await sendNextTrialEmail(send, now)).toBe(true);
  const pending = await prisma.trialInvitation.findUniqueOrThrow({ where: { id: inv.id } });
  expect(pending.emailStatus).toBe("queued");
  expect(await sendNextTrialEmail(send, new Date(pending.nextEmailAttemptAt!.getTime() + 1))).toBe(true);
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]);
  expect(send.mock.calls[0][0]).toMatchObject({ to: f.recipient.email, idempotencyKey: `trial-invitation/${inv.id}` });
  expect(send.mock.calls[0][0].text).toContain(inv.url);
  expect(send.mock.calls[0][0].text).not.toContain("Retired personal label");
  expect((await prisma.trialInvitation.findUniqueOrThrow({ where: { id: inv.id } })).emailStatus).toBe("sent");
});

it("cancels unused invitation delivery after revocation and never grants from a profile name", async () => {
  const f = await fixture();
  const inv = await invitation(f.admin.id, f.recipient.email);
  await revokeTrialInvitation(f.admin.id, inv.id);
  const send = vi.fn();
  expect(await sendNextTrialEmail(send)).toBe(false);
  expect(send).not.toHaveBeenCalled();
  await expect(acceptTrialInvitation(f.recipient.id, { invitationId: inv.id, name: "Revoked" })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(createTrialInvitation(f.recipient.id, f.other.email)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("uses Tripanize.app in profile, traveler and audit labels and can continue included onboarding without payment", async () => {
  const f = await fixture();
  expect(accountDisplayName(f.admin)).toBe("Tripanize.app");
  await updateProfile(f.admin.id, { name: "A personal label", defaultCurrency: "EUR", pace: "BALANCED", interests: [], mapsApp: "GOOGLE" });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: f.admin.id } })).name).toBe("Tripanize.app");
  const draft = await createTripDraft(f.admin.id, "Company trip");
  expect((await prisma.traveler.findFirstOrThrow({ where: { tripId: draft.id, userId: f.admin.id } })).name).toBe("Tripanize.app");
  expect((await prisma.auditLog.findFirstOrThrow({ where: { tripId: draft.id } })).actorName).toBe("Tripanize.app");
  expect(await chooseNormal(f.admin.id, draft.id)).toMatchObject({ next: `/trips/${draft.id}/onboarding` });
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: draft.id } })).onboardingPlan).toBe("PREMIUM");
  expect(await prisma.premiumCheckout.count()).toBe(0);
});

it("migrates old company display labels without changing another member or resending old email payloads", async () => {
  const f = await fixture();
  const tripId = await makeTrip(f.admin.id);
  const otherTrip = await makeTrip(f.other.id);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { tripId } });
  await prisma.auditLog.update({ where: { id: audit.id }, data: { actorName: "Retired personal label" } });
  await prisma.traveler.updateMany({ where: { tripId, userId: f.admin.id }, data: { name: "Retired personal label" } });
  await prisma.chatMessage.create({ data: { tripId, senderId: f.admin.id, senderName: "Retired personal label", clientId: "old-message", body: "Keep the message content", seq: 1, revision: 1 } });
  await prisma.tripNotification.create({ data: { userId: f.recipient.id, tripId, auditId: audit.id, kind: "change", tripName: "Company trip", summary: "Retired personal label updated trip details.", href: "/trips", emailStatus: "queued", emailText: "Immutable old payload", nextAttemptAt: new Date() } });
  await normalizeCompanyIdentity();
  await normalizeCompanyIdentity();
  const notification = await prisma.tripNotification.findFirstOrThrow({ where: { tripId } });
  expect(notification).toMatchObject({ summary: "Tripanize.app updated trip details.", emailStatus: "cancelled", emailText: "Immutable old payload", nextAttemptAt: null });
  expect((await prisma.user.findUniqueOrThrow({ where: { id: f.admin.id } })).name).toBe("Tripanize.app");
  expect((await prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } })).actorName).toBe("Tripanize.app");
  expect((await prisma.traveler.findFirstOrThrow({ where: { tripId, userId: f.admin.id } })).name).toBe("Tripanize.app");
  expect(await prisma.chatMessage.findFirstOrThrow({ where: { tripId } })).toMatchObject({ senderName: "Tripanize.app", body: "Keep the message content" });
  expect((await prisma.traveler.findFirstOrThrow({ where: { tripId: otherTrip, userId: f.other.id } })).name).toBe(f.other.name);
});

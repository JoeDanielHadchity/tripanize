import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { getAccountPlan, getTripPlan } from "@/server/plans/access";
import { normalPlanningDates, planningScope } from "@/server/plans/planning";
import { createExpense, getExpenseData, type ExpenseInput } from "@/server/expenses/service";
import { addStop } from "@/server/itinerary/service";
import { createBooking, listBookings } from "@/server/bookings/service";
import { addPackingItem, refreshSuggestions } from "@/server/packing/service";
import { getChatPage, sendChatMessage } from "@/server/chat/service";
import { changeMemberLocation, getLocationSelf, getMemberLocations } from "@/server/locations/service";
import { addCustomEvent, listEvents } from "@/server/events/service";
import { requestDiscovery, runDiscovery } from "@/server/events/discovery";
import { getAssistantConversation, sendAssistantMessage } from "@/server/assistant/service";
import { getPlanQuestions, generatePlanQuestions } from "@/server/planner/questions";
import { enqueueJob } from "@/server/planner/jobs";
import { claimJob, runJob, type Generator } from "@/server/planner/run";
import { applyProposal } from "@/server/planner/apply";
import { exportTripJson } from "@/server/export";
import type { Proposal } from "@/server/planner/schema";
import { makeTrip, makeUser, resetDb } from "./helpers";

const runtime = currentRuntime();
const previousKey = process.env.OPENAI_API_KEY;
beforeEach(async () => {
  await resetDb();
  setTestRuntime({ ...runtime, planAccessEnabled: true });
  process.env.OPENAI_API_KEY = "isolated-test-key-no-external-requests";
});
afterEach(() => {
  setTestRuntime(runtime);
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
});
async function fixture() {
  const owner = await makeUser("Owner"), member = await makeUser("Member"), viewer = await makeUser("Viewer"), outsider = await makeUser("Outsider");
  const tripId = await makeTrip(owner.id, { startDate: "2020-05-01", endDate: "2020-05-08", mustSee: [] });
  await prisma.destination.updateMany({ where: { tripId }, data: { lat: 38.7, lng: -9.1 } });
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  const travelers = await prisma.traveler.findMany({ where: { tripId } });
  const input: ExpenseInput = { description: "Lunch", amount: "25", currency: "EUR", category: "Food", date: days[0].date, payerId: travelers[0].id, method: "EQUAL", participants: travelers.map(t => ({ travelerId: t.id })) };
  return { owner, member, viewer, outsider, tripId, days, input };
}
async function premium(userId: string) {
  return prisma.premiumEntitlement.upsert({ where: { userId }, create: { userId, source: "isolated-test", validUntil: new Date(Date.now() + 86400_000) }, update: { validUntil: new Date(Date.now() + 86400_000), revokedAt: null } });
}
function proposal(dates: string[]): Proposal {
  return { summary: "Draft", generalNotes: [], unplacedMustSees: [], days: dates.map(date => ({ date, title: "Explore", area: "Lisbon", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null })) };
}

it("allows Normal to plan every day manually, add bookings and packing, while denying Premium services", async () => {
  const f = await fixture();
  expect(await getAccountPlan(f.owner.id)).toMatchObject({ premium: false, preview: false });
  await addStop(f.owner.id, f.tripId, { dayId: f.days[7].id, input: { title: "My day 8 plan" } });
  const booking = await createBooking(f.member.id, f.tripId, { title: "Own hotel", category: "ACCOMMODATION", currency: "EUR", status: "BOOKED" });
  await addPackingItem(f.viewer.id, f.tripId, { label: "Sunglasses", category: "Clothing", shared: false });
  expect((await listBookings(f.owner.id, f.tripId)).bookings[0].id).toBe(booking.id);
  const denied = [
    () => getExpenseData(f.owner.id, f.tripId), () => createExpense(f.owner.id, f.tripId, f.input),
    () => getChatPage(f.owner.id, f.tripId), () => sendChatMessage(f.owner.id, f.tripId, { clientId: randomUUID(), body: "Hello" }),
    () => getMemberLocations(f.owner.id, f.tripId), () => getLocationSelf(f.owner.id, f.tripId),
    () => listEvents(f.owner.id, f.tripId), () => addCustomEvent(f.owner.id, f.tripId, { title: "Custom event" }),
    () => requestDiscovery(f.owner.id, f.tripId), () => refreshSuggestions(f.owner.id, f.tripId, { laundry: null }),
    () => getAssistantConversation(f.owner.id, f.tripId),
    () => sendAssistantMessage(f.owner.id, f.tripId, { clientId: randomUUID(), message: "Plan day 8", selectedDate: null }),
    () => enqueueJob(f.owner.id, f.tripId, "days", { dates: [f.days[0].date] }),
  ];
  for (const call of denied) await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN", details: { upgrade: true } });
  await expect(getExpenseData(f.outsider.id, f.tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await prisma.expense.count()).toBe(0);
  expect(await prisma.generationJob.count()).toBe(0);
  expect((await getPlanQuestions(f.owner.id, f.tripId, { refresh: true })).source).toBe("standard");
  const generate = vi.fn();
  await expect(generatePlanQuestions(f.tripId, generate as Generator)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(generate).not.toHaveBeenCalled();
});

it("the organizer's subscription covers members while paid collaborators cannot unlock someone else's Normal trip", async () => {
  const f = await fixture();
  await premium(f.member.id);
  expect((await getTripPlan(f.tripId)).premium).toBe(false);
  await expect(getChatPage(f.member.id, f.tripId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await premium(f.owner.id);
  expect((await getTripPlan(f.tripId)).premium).toBe(true);
  await createExpense(f.member.id, f.tripId, f.input);
  expect((await getExpenseData(f.viewer.id, f.tripId)).expenses).toHaveLength(1);
  await expect(createExpense(f.viewer.id, f.tripId, f.input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await sendChatMessage(f.viewer.id, f.tripId, { clientId: randomUUID(), body: "Thanks!" });
  expect((await getChatPage(f.member.id, f.tripId)).messages).toHaveLength(1);
  await prisma.premiumEntitlement.update({ where: { userId: f.owner.id }, data: { revokedAt: new Date() } });
  expect((await getTripPlan(f.tripId)).premium).toBe(false);
  expect(await prisma.expense.count()).toBe(1);
  await expect(getExpenseData(f.member.id, f.tripId)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("expiry retains records, blocks their restricted exports and permits turning location sharing off", async () => {
  const f = await fixture();
  await premium(f.owner.id);
  await createExpense(f.owner.id, f.tripId, f.input);
  await addCustomEvent(f.owner.id, f.tripId, { title: "Concert" });
  const self = await getLocationSelf(f.member.id, f.tripId);
  const token = "test-location-token-012345678901234567890";
  await changeMemberLocation(f.member.id, f.tripId, { op: "start", token, expectedVersion: self.version, scope: self.scope, lat: 38.7, lng: -9.1, accuracy: 10, capturedAt: new Date().toISOString() });
  await prisma.premiumEntitlement.update({ where: { userId: f.owner.id }, data: { validUntil: new Date(Date.now() - 1000) } });
  await expect(getMemberLocations(f.owner.id, f.tripId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(changeMemberLocation(f.member.id, f.tripId, { op: "update", token, lat: 38.7, lng: -9.1, accuracy: 10, capturedAt: new Date().toISOString() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await changeMemberLocation(f.member.id, f.tripId, { op: "stop" })).sessionId).toBeNull();
  const exported = await exportTripJson(f.owner.id, f.tripId);
  expect(exported.trip.expenses).toEqual([]);
  expect(exported.trip.settlements).toEqual([]);
  expect(exported.trip.events).toEqual([]);
  expect(await prisma.expense.count()).toBe(1);
  expect(await prisma.tripEvent.count()).toBe(1);
  await premium(f.owner.id);
  expect((await getExpenseData(f.owner.id, f.tripId)).expenses).toHaveLength(1);
});

it("caps the real Normal generation input/output at three saved dates and rejects applying an old Premium day", async () => {
  const f = await fixture();
  const result = await enqueueJob(f.owner.id, f.tripId, "full", { dates: [f.days[7].date], instruction: "Plan all eight days" });
  await claimJob(result.jobId);
  const calls: string[][] = [];
  await runJob(result.jobId, (async (opts: { input: string }) => {
    const data = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]);
    calls.push(data.datesToPlan);
    return { data: proposal(f.days.map(d => d.date)), model: "isolated", sources: [], usage: null };
  }) as Generator);
  expect(calls).toEqual([f.days.slice(0, 3).map(d => d.date)]);
  const job = await prisma.generationJob.findUniqueOrThrow({ where: { id: result.jobId } });
  expect(job.status).toBe("SUCCEEDED");
  expect((job.proposal as unknown as Proposal).days.map(d => d.date)).toEqual(f.days.slice(0, 3).map(d => d.date));
  await applyProposal(f.owner.id, f.tripId, job.id, [f.days[0].date]);
  const old = await prisma.generationJob.create({ data: { tripId: f.tripId, kind: "full", requestedById: f.owner.id, params: {}, status: "SUCCEEDED", proposal: proposal([f.days[7].date]) as never } });
  await expect(applyProposal(f.owner.id, f.tripId, old.id, [f.days[7].date])).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.trip.update({ where: { id: f.tripId }, data: { startDate: "2021-01-01", endDate: "2021-01-08" } });
  expect(await normalPlanningDates(f.tripId)).toEqual(f.days.slice(0, 3).map(d => d.date));
  await expect(planningScope(f.tripId, "full")).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("rechecks queued AI jobs after expiry without calling an AI provider", async () => {
  const f = await fixture();
  await premium(f.owner.id);
  const { jobId } = await enqueueJob(f.owner.id, f.tripId, "days", { dates: [f.days[7].date] });
  const assistant = await sendAssistantMessage(f.owner.id, f.tripId, { clientId: randomUUID(), message: "Change day 8", selectedDate: null });
  const discovery = await prisma.discoveryRun.create({ data: { tripId: f.tripId, trigger: "manual", requestedById: f.owner.id } });
  await prisma.premiumEntitlement.update({ where: { userId: f.owner.id }, data: { validUntil: new Date(Date.now() - 1000) } });
  const generate = vi.fn();
  await claimJob(jobId); await runJob(jobId, generate as Generator);
  await claimJob(assistant.id); await runJob(assistant.id, generate as Generator);
  await runDiscovery(discovery.id, generate as Generator);
  expect(generate).not.toHaveBeenCalled();
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("FAILED");
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: assistant.id } })).status).toBe("FAILED");
  expect((await prisma.discoveryRun.findUniqueOrThrow({ where: { id: discovery.id } })).status).toBe("failed");
});

it("keeps the existing app available in preview until the billing rollout is enabled", async () => {
  const f = await fixture();
  setTestRuntime({ ...runtime, planAccessEnabled: false });
  expect(await getTripPlan(f.tripId)).toMatchObject({ premium: true, preview: true });
  await createExpense(f.owner.id, f.tripId, f.input);
  expect((await getExpenseData(f.owner.id, f.tripId)).expenses).toHaveLength(1);
});

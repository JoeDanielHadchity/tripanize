import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";
import { prisma } from "@/server/db";
import { addStop, restoreVersion, updateStop } from "@/server/itinerary/service";
import { createBooking } from "@/server/bookings/service";
import { addCustomEvent, scheduleEvent } from "@/server/events/service";
import { removeMember } from "@/server/invitations/service";
import { exportTripJson } from "@/server/export";
import { claimJob, runJob, type Generator } from "@/server/planner/run";
import { cancelJob, getJob } from "@/server/planner/jobs";
import { applyProposal } from "@/server/planner/apply";
import { applyAssistantChanges, cancelAssistantReply, dismissAssistantProposal, getAssistantConversation, sendAssistantMessage } from "@/server/assistant/service";
import { AssistantResponseSchema, assistantCommand, type AssistantEdit } from "@/server/assistant/schema";
import { loadAssistantState, previewAssistantEdits } from "@/server/assistant/edits";
import { makeTrip, makeUser, resetDb } from "./helpers";

const previousKey = process.env.OPENAI_API_KEY;
beforeEach(async () => { await resetDb(); process.env.OPENAI_API_KEY = "isolated-test-key"; });
afterEach(() => { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; });
async function fixture() {
  const owner = await makeUser("Owner"), member = await makeUser("Member"), viewer = await makeUser("Viewer"), outsider = await makeUser("Outside");
  const tripId = await makeTrip(owner.id, { mustSee: [] });
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  await prisma.itineraryDay.update({ where: { id: days[1].id }, data: { title: "Architecture", notes: "Architecture day notes", activePlan: "B" } });
  await prisma.itineraryDay.update({ where: { id: days[2].id }, data: { title: "Parks", notes: "Park day notes" } });
  const a = await addStop(owner.id, tripId, { dayId: days[1].id, input: { title: "Old museum", startTime: "10:00", durationMin: 60, estCost: "12" } });
  const b = await addStop(owner.id, tripId, { dayId: days[2].id, input: { title: "City park", startTime: "11:00", durationMin: 45 } });
  const alt = await addStop(owner.id, tripId, { dayId: days[1].id, plan: "B", input: { title: "Indoor alternative", startTime: "10:00", durationMin: 60 } });
  return { owner, member, viewer, outsider, tripId, days, a, b, alt };
}
async function prepare(userId: string, tripId: string, edits: AssistantEdit[], message = "Change my itinerary") {
  const { id } = await sendAssistantMessage(userId, tripId, { clientId: randomUUID(), message, selectedDate: null });
  await claimJob(id);
  await runJob(id, (async () => ({ data: { reply: "Here is a proposed change.", edits }, model: "isolated-stub", sources: [], usage: null })) as Generator);
  expect((await getJob(userId, tripId, id)).status).toBe("SUCCEEDED");
  return id;
}

it("queues and deduplicates private requests without changing the shared trip; rejects invalid input and strangers", async () => {
  const f = await fixture(), revision = (await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).revision;
  const input = { clientId: randomUUID(), message: "Swap days 2 and 3", selectedDate: f.days[1].date };
  const a = await sendAssistantMessage(f.owner.id, f.tripId, input), b = await sendAssistantMessage(f.owner.id, f.tripId, input);
  expect(a).toEqual(b);
  expect(await prisma.generationJob.count({ where: { kind: "assistant" } })).toBe(1);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).revision).toBe(revision);
  await expect(sendAssistantMessage(f.owner.id, f.tripId, { ...input, message: "Different" })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(sendAssistantMessage(f.owner.id, f.tripId, { ...input, clientId: randomUUID() })).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(sendAssistantMessage(f.outsider.id, f.tripId, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(assistantCommand.safeParse({ op: "send", ...input, message: "x".repeat(3001) }).success).toBe(false);
  expect(assistantCommand.safeParse({ op: "apply", id: a.id, edits: [] }).success).toBe(false);
  expect(zodTextFormat(AssistantResponseSchema, "assistant").schema).toMatchObject({ type: "object" });
});

it("previews and atomically swaps both day plans and notes, applies once, notifies members and saves a restorable version", async () => {
  const f = await fixture();
  await prisma.tripNotification.deleteMany(); await prisma.auditLog.deleteMany();
  const budget = (await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).budgetMinor;
  const id = await prepare(f.owner.id, f.tripId, [{ type: "swap_days", date: f.days[1].date, otherDate: f.days[2].date }]);
  expect((await prisma.stop.findUniqueOrThrow({ where: { id: f.a.id } })).dayId).toBe(f.days[1].id);
  const pending = (await getAssistantConversation(f.owner.id, f.tripId)).turns[0];
  expect(pending.preview?.days).toHaveLength(2);
  expect(pending.preview?.conflicts).toEqual([]);
  await applyAssistantChanges(f.owner.id, f.tripId, id);
  await applyAssistantChanges(f.owner.id, f.tripId, id);
  expect((await prisma.stop.findUniqueOrThrow({ where: { id: f.a.id } })).dayId).toBe(f.days[2].id);
  expect((await prisma.stop.findUniqueOrThrow({ where: { id: f.alt.id } })).dayId).toBe(f.days[2].id);
  expect(await prisma.itineraryDay.findUniqueOrThrow({ where: { id: f.days[2].id } })).toMatchObject({ title: "Architecture", notes: "Architecture day notes", activePlan: "B" });
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: f.tripId } })).budgetMinor).toBe(budget);
  expect(await prisma.expense.count()).toBe(0);
  expect(await prisma.auditLog.count()).toBe(1);
  expect(await prisma.tripNotification.count()).toBe(2);
  const versions = await prisma.itineraryVersion.findMany({ where: { tripId: f.tripId } });
  expect(versions).toHaveLength(1);
  await restoreVersion(f.owner.id, f.tripId, versions[0].id);
  expect(await prisma.itineraryDay.findUniqueOrThrow({ where: { id: f.days[1].id } })).toMatchObject({ title: "Architecture", notes: "Architecture day notes" });
});

it("keeps assistant history private across APIs and prevents other editors from applying or cancelling it", async () => {
  const f = await fixture();
  const id = await prepare(f.owner.id, f.tripId, [], "Private assistant question");
  expect((await getAssistantConversation(f.member.id, f.tripId)).turns).toEqual([]);
  for (const fn of [() => getJob(f.member.id, f.tripId, id), () => cancelJob(f.member.id, f.tripId, id), () => cancelAssistantReply(f.member.id, f.tripId, id), () => dismissAssistantProposal(f.member.id, f.tripId, id), () => applyAssistantChanges(f.member.id, f.tripId, id)]) await expect(fn()).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(getAssistantConversation(f.outsider.id, f.tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(applyProposal(f.owner.id, f.tripId, id, [f.days[0].date])).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(JSON.stringify(await exportTripJson(f.owner.id, f.tripId))).not.toContain("Private assistant question");
});

it("rejects stale and superseded proposals instead of overwriting concurrent edits", async () => {
  const f = await fixture();
  const edit: AssistantEdit = { type: "edit_stop", stopId: f.a.id, startTime: "11:00", durationMin: null, notes: null };
  const id = await prepare(f.owner.id, f.tripId, [edit]);
  await updateStop(f.member.id, f.tripId, f.a.id, { notes: "New collaborator note" }, { version: f.a.version });
  await expect(applyAssistantChanges(f.owner.id, f.tripId, id)).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await prisma.stop.findUniqueOrThrow({ where: { id: f.a.id } })).notes).toBe("New collaborator note");
  const next = await prepare(f.owner.id, f.tripId, [edit]);
  await prepare(f.owner.id, f.tripId, [], "Actually leave it as it is");
  await expect(applyAssistantChanges(f.owner.id, f.tripId, next)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await prisma.itineraryVersion.count()).toBe(0);
});

it("protects canonical bookings, chosen events and fixed commitments, and does not partially apply a blocked batch", async () => {
  const f = await fixture();
  const booking = await createBooking(f.owner.id, f.tripId, { title: "Reserved table", category: "RESTAURANT", status: "BOOKED", date: f.days[2].date, startTime: "13:00", currency: "EUR" });
  const booked = await prisma.stop.findFirstOrThrow({ where: { bookingId: booking.id } });
  const event = await addCustomEvent(f.owner.id, f.tripId, { title: "Chosen concert", date: f.days[0].date });
  await scheduleEvent(f.owner.id, f.tripId, event.id, f.days[0].id, "18:00", 60);
  const eventStop = await prisma.stop.findFirstOrThrow({ where: { eventId: event.id } });
  const fixed = await addStop(f.owner.id, f.tripId, { dayId: f.days[0].id, input: { title: "Commitment", startTime: "16:00" } });
  await prisma.stop.update({ where: { id: fixed.id }, data: { isFixed: true } });
  const state = await loadAssistantState(prisma, f.tripId);
  for (const s of [booked, eventStop, fixed]) expect(() => previewAssistantEdits(state, [{ type: "remove_stop", stopId: s.id }])).toThrow(/protected/);
  const id = await prepare(f.owner.id, f.tripId, [{ type: "remove_stop", stopId: f.a.id }, { type: "remove_stop", stopId: booked.id }]);
  expect((await getAssistantConversation(f.owner.id, f.tripId)).turns[0].preview?.conflicts[0]).toContain("protected");
  await expect(applyAssistantChanges(f.owner.id, f.tripId, id)).rejects.toMatchObject({ code: "VALIDATION" });
  expect(await prisma.stop.findUnique({ where: { id: f.a.id } })).not.toBeNull();
  expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: "BOOKED", date: f.days[2].date });
  expect(await prisma.itineraryVersion.count()).toBe(0);
  expect(() => previewAssistantEdits(state, [{ type: "swap_days", date: f.days[1].date, otherDate: f.days[2].date }])).toThrow(/commitment/);
});

it("supports focused moves, time edits, suggestions and removals while keeping actual spending independent", async () => {
  const f = await fixture();
  const suggested = { title: "Riverside break", category: "rest" as const, locationName: null, address: null, lat: null, lng: null, reason: "A relaxed break", startTime: "15:00", durationMin: 30, travelToNextMin: null, travelMode: null, travelNote: null, estCost: 5, bookingRequired: false, bookingNote: null, hoursNote: null, hoursVerified: false, officialUrl: "javascript:alert(1)", sourceUrls: ["javascript:bad"], isMeal: false, isFreeTime: true, indoor: false };
  const id = await prepare(f.owner.id, f.tripId, [
    { type: "move_stop", stopId: f.a.id, date: f.days[2].date, plan: "A", startTime: "09:00" },
    { type: "edit_stop", stopId: f.b.id, startTime: "12:00", durationMin: 80, notes: "Bring water" },
    { type: "add_stop", date: f.days[2].date, plan: "A", stop: suggested },
    { type: "remove_stop", stopId: f.alt.id },
  ]);
  await applyAssistantChanges(f.owner.id, f.tripId, id);
  expect(await prisma.stop.findUniqueOrThrow({ where: { id: f.a.id } })).toMatchObject({ dayId: f.days[2].id, startTime: "09:00" });
  expect(await prisma.stop.findUniqueOrThrow({ where: { id: f.b.id } })).toMatchObject({ startTime: "12:00", durationMin: 80, notes: "Bring water" });
  expect(await prisma.stop.findUnique({ where: { id: f.alt.id } })).toBeNull();
  expect(await prisma.stop.findFirstOrThrow({ where: { title: "Riverside break" } })).toMatchObject({ status: "SUGGESTED", origin: "AI", officialUrl: null, sourceUrls: [], estCostMinor: 500 });
  expect(await prisma.expense.count()).toBe(0);
});

it("does not allow references to another trip and blocks new overlaps with reservations and invalid transfer times", async () => {
  const f = await fixture(), otherTrip = await makeTrip(f.outsider.id);
  const otherStop = await addStop(f.outsider.id, otherTrip, { dayId: null, input: { title: "Unrelated private activity" } });
  const state = await loadAssistantState(prisma, f.tripId);
  expect(() => previewAssistantEdits(state, [{ type: "remove_stop", stopId: otherStop.id }])).toThrow(/no longer exists/);
  const booking = await createBooking(f.owner.id, f.tripId, { title: "Ticketed visit", category: "ATTRACTION", status: "BOOKED", date: f.days[2].date, startTime: "12:00", durationMin: 90, currency: "EUR" });
  const id = await prepare(f.owner.id, f.tripId, [{ type: "move_stop", stopId: f.a.id, date: f.days[2].date, plan: "A", startTime: "12:30" }]);
  await expect(applyAssistantChanges(f.owner.id, f.tripId, id)).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).startTime).toBe("12:00");
  await prisma.trip.update({ where: { id: f.tripId }, data: { arrivalAt: `${f.days[0].date}T10:00` } });
  const transfer = previewAssistantEdits(await loadAssistantState(prisma, f.tripId), [{ type: "move_stop", stopId: f.a.id, date: f.days[0].date, plan: "A", startTime: "10:10" }]);
  expect(transfer.preview.conflicts.join(" ")).toContain("arrival");
});

it("lets viewers ask questions but never apply edits, including after an editor is downgraded", async () => {
  const f = await fixture(), edit: AssistantEdit = { type: "remove_stop", stopId: f.a.id };
  const id = await prepare(f.viewer.id, f.tripId, [edit]);
  expect((await getAssistantConversation(f.viewer.id, f.tripId)).turns[0].preview?.changes).toEqual([]);
  await expect(applyAssistantChanges(f.viewer.id, f.tripId, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const draft = await prepare(f.member.id, f.tripId, [edit]);
  await prisma.tripMembership.update({ where: { tripId_userId: { tripId: f.tripId, userId: f.member.id } }, data: { role: "VIEWER" } });
  await expect(applyAssistantChanges(f.member.id, f.tripId, draft)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await prisma.stop.findUnique({ where: { id: f.a.id } })).not.toBeNull();
});

it("scopes history and pending work to the current membership so leaving and rejoining cannot revive old proposals", async () => {
  const f = await fixture();
  const { id } = await sendAssistantMessage(f.member.id, f.tripId, { clientId: randomUUID(), message: "My private request", selectedDate: null });
  await removeMember(f.owner.id, f.tripId, f.member.id);
  await prisma.tripMembership.create({ data: { tripId: f.tripId, userId: f.member.id, role: "COLLABORATOR" } });
  expect((await getAssistantConversation(f.member.id, f.tripId)).turns).toEqual([]);
  await expect(getJob(f.member.id, f.tripId, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await claimJob(id);
  let called = false;
  await runJob(id, (async () => { called = true; throw new Error("Must not call upstream"); }) as Generator);
  expect(called).toBe(false);
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id } })).status).toBe("CANCELLED");
});

it("does not send group chat, live locations, personal packing or booking references to the model", async () => {
  const f = await fixture();
  await createBooking(f.owner.id, f.tripId, { title: "Hotel", category: "ACCOMMODATION", status: "BOOKED", date: f.days[0].date, currency: "EUR", confirmationRef: "CANARY-CONFIRMATION" });
  await prisma.chatMessage.create({ data: { tripId: f.tripId, senderId: f.member.id, senderName: "Member", clientId: randomUUID(), seq: 1, revision: 1, body: "CANARY-GROUP-CHAT" } });
  await prisma.packingItem.create({ data: { tripId: f.tripId, ownerId: f.member.id, listKey: f.member.id, normKey: "private", label: "CANARY-PACKING", category: "Personal" } });
  const m = await prisma.tripMembership.findUniqueOrThrow({ where: { tripId_userId: { tripId: f.tripId, userId: f.member.id } } });
  await prisma.memberLocation.create({ data: { membershipId: m.id, sessionId: "CANARY-LOCATION", lat: 12.345678, lng: 23.456789 } });
  const { id } = await sendAssistantMessage(f.owner.id, f.tripId, { clientId: randomUUID(), message: "What is planned?", selectedDate: f.days[1].date });
  await claimJob(id);
  let prompt = "";
  await runJob(id, (async (opts: { input: string }) => { prompt = opts.input; return { data: { reply: "Your museum day is planned.", edits: [] }, model: "stub", sources: [], usage: null }; }) as Generator);
  expect(prompt).toContain("Old museum");
  expect(prompt).not.toMatch(/CANARY|12\.345678|23\.456789/);
});

it("cancels queued work without calling AI and dismisses a proposal without any itinerary change", async () => {
  const f = await fixture();
  const queued = await sendAssistantMessage(f.owner.id, f.tripId, { clientId: randomUUID(), message: "Wait", selectedDate: null });
  await cancelAssistantReply(f.owner.id, f.tripId, queued.id);
  expect((await getJob(f.owner.id, f.tripId, queued.id)).status).toBe("CANCELLED");
  const id = await prepare(f.owner.id, f.tripId, [{ type: "remove_stop", stopId: f.a.id }]);
  await dismissAssistantProposal(f.owner.id, f.tripId, id);
  await expect(applyAssistantChanges(f.owner.id, f.tripId, id)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await prisma.stop.findUnique({ where: { id: f.a.id } })).not.toBeNull();
});

import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { createTripDraft, chooseNormal, saveOnboardingDetails, startOnboardingPlan, finishOnboarding, retryOnboarding } from "@/server/trips/onboarding";
import { claimJob, runJob, type Generator } from "@/server/planner/run";
import { getPlanQuestions, STANDARD_QUESTIONS } from "@/server/planner/questions";
import { listBookings, createBooking } from "@/server/bookings/service";
import { setEventStatus } from "@/server/events/service";
import { getPacking, removePackingItem } from "@/server/packing/service";
import { addStop } from "@/server/itinerary/service";
import { makeUser, resetDb, adminAuthenticationFixture } from "./helpers";
import { createTrialInvitation } from "@/server/admin/trials";

vi.mock("@/server/weather/trip", () => ({
  ensureDestinationCoords: async (tripId: string) => prisma.destination.findMany({ where: { tripId }, orderBy: { position: "asc" } }),
  getTripWeather: async () => ({ byDate: { "2027-05-01": { date: "2027-05-01", destination: "Lisbon", kind: "typical", summary: "Mild", tMin: 14, tMax: 25, precipMm: 0, precipProb: null } }, unavailable: [] }),
}));
const runtime = currentRuntime(); const key = process.env.OPENAI_API_KEY;
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); process.env.OPENAI_API_KEY = "isolated-test-not-a-real-key"; });
afterEach(() => { setTestRuntime(runtime); if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; });
const details = { name: "Lisbon in May", startDate: "2027-05-01", endDate: "2027-05-04", adults: 30, timezone: "Europe/Lisbon", destinations: [{ name: "Lisbon", country: "Portugal" }], interests: ["Culture"], preferences: "Light luggage", notes: "Enjoy local traditions" };
const answers = STANDARD_QUESTIONS.map(q => ({ q: q.q, a: [q.options[0]] }));
const result = (data: unknown) => ({ data, model: "isolated", sources: [], usage: null });
function generator(calls: string[], failPacking = false): Generator {
  return (async (opts: { name: string; input: string }) => {
    calls.push(opts.name); const input = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]);
    if (opts.name === "plan_questions") return result({ questions: STANDARD_QUESTIONS });
    if (opts.name === "events") return result({ events: [{ title: "Lisbon cultural evening", category: "cultural", date: "2027-05-02", endDate: null, startTime: "18:00", dateVerified: true, venue: "Test venue", city: "Lisbon", address: null, officialUrl: "https://example.test/event", bookingUrl: "https://example.test/tickets", priceText: null, availability: null, bookingDeadline: null, cancelled: false, soldOut: false, whyFits: "Culture preference", uncertainty: null, sources: [] }] });
    if (opts.name === "trip_packing") {
      if (failPacking) throw new Error("Synthetic packing interruption");
      expect(input.answers.answers).toHaveLength(6); expect(input.weather[0].kind).toBe("typical"); expect(input.events[0].title).toBe("Lisbon cultural evening"); expect(input.destinations[0].country).toBe("Portugal");
      return result({ items: [{ label: "Light linen layer", category: "Clothing", reason: "May's typical warm afternoons and your light-luggage preference", shared: false, quantity: 1 }] });
    }
    if (opts.name !== "trip_plan") throw new Error(`Unexpected model operation ${opts.name}`);
    return result({ summary: "Ready", generalNotes: [], unplacedMustSees: [], days: input.datesToPlan.map((date: string) => ({ date, title: "Explore", area: "Lisbon", isTravelDay: false, driveMinutes: null, planB: [], planBNote: null, notes: [], questions: [], estCost: null, stops: [{ title: date === "2027-05-02" ? "Lisbon cultural evening" : `Walk ${date}`, category: date === "2027-05-02" ? "event" : "sight", locationName: null, address: null, lat: null, lng: null, reason: "Fits your interests", startTime: "18:00", durationMin: 60, travelToNextMin: null, travelMode: null, travelNote: null, estCost: null, bookingRequired: false, bookingNote: null, hoursNote: null, hoursVerified: false, officialUrl: null, sourceUrls: [], isMeal: false, isFreeTime: false, indoor: null }] })) });
  }) as Generator;
}
async function fixture(premium: boolean | "trial") {
  const owner = await makeUser("Owner");
  if (premium === "trial") {
    const admin = await makeUser("Company", "company-trial@example.test");
    await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: true } });
    await prisma.user.update({ where: { id: owner.id }, data: { emailVerified: true } });
    setTestRuntime({ ...currentRuntime(), companyAdminEmail: admin.email });
    await adminAuthenticationFixture(admin.id);
    await createTrialInvitation(admin.id, owner.email);
  }
  const { id: tripId } = await createTripDraft(owner.id, "Our trip");
  if (premium === true) {
    await prisma.premiumCheckout.create({ data: { tripId, buyerId: owner.id, environment: "live", priceId: "isolated-price", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
    await prisma.trip.update({ where: { id: tripId }, data: { onboardingStage: "DETAILS", onboardingPlan: "PREMIUM" } });
  } else if (!premium) await chooseNormal(owner.id, tripId);
  const version = (await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).version;
  await saveOnboardingDetails(owner.id, tripId, details, version);
  return { owner, tripId };
}
it("keeps payment before Premium details/questions and restricts setup choices to the organizer", async () => {
  const owner = await makeUser("Owner"), editor = await makeUser("Editor"); const { id } = await createTripDraft(owner.id, "New trip");
  await prisma.tripMembership.create({ data: { tripId: id, userId: editor.id, role: "COLLABORATOR" } });
  await expect(chooseNormal(editor.id, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(saveOnboardingDetails(owner.id, id, details, 1)).rejects.toMatchObject({ code: "CONFLICT" });
  await prisma.trip.update({ where: { id }, data: { onboardingStage: "DETAILS", onboardingPlan: "PREMIUM" } });
  await expect(saveOnboardingDetails(owner.id, id, details, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await prisma.generationJob.count()).toBe(0);
});
it("automatically applies only two Normal days and never searches events or creates custom packing", async () => {
  const { owner, tripId } = await fixture(false); const calls: string[] = []; const generate = generator(calls);
  expect((await getPlanQuestions(owner.id, tripId)).source).toBe("standard");
  const { jobId } = await startOnboardingPlan(owner.id, tripId, { answers, note: null });
  await claimJob(jobId); await runJob(jobId, generate);
  const finish = await prisma.generationJob.findFirstOrThrow({ where: { tripId, kind: "setup" } });
  await claimJob(finish.id); await runJob(finish.id, generate);
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, include: { stops: true }, orderBy: { date: "asc" } });
  expect(days.map(d => d.stops.length)).toEqual([1, 1, 0, 0]);
  expect(calls).toEqual(["trip_plan"]); expect(await prisma.tripEvent.count()).toBe(0); expect(await prisma.packingItem.count()).toBe(0);
  await addStop(owner.id, tripId, { dayId: days[3].id, input: { title: "Manual day 4" } });
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).onboardingStage).toBe("COMPLETE");
});
it.each([true, "trial"] as const)("prepares a complete Premium trip with tailored questions, events and personalized packing (access: %s)", async access => {
  const { owner, tripId } = await fixture(access); const calls: string[] = []; const generate = generator(calls);
  const questions = await prisma.generationJob.findFirstOrThrow({ where: { tripId, kind: "questions" } });
  await claimJob(questions.id); await runJob(questions.id, generate);
  expect((await getPlanQuestions(owner.id, tripId)).source).toBe("ai");
  const { jobId } = await startOnboardingPlan(owner.id, tripId, { answers, note: "Enjoy local traditions" });
  await claimJob(jobId); await runJob(jobId, generate);
  const finish = await prisma.generationJob.findFirstOrThrow({ where: { tripId, kind: "setup" } });
  await claimJob(finish.id); await runJob(finish.id, generate);
  expect(calls).toEqual(["plan_questions", "events", "trip_plan", "trip_packing"]);
  expect(await prisma.stop.count({ where: { tripId } })).toBe(4);
  const suggestions = await listBookings(owner.id, tripId); expect(suggestions.suggestedEvents).toHaveLength(1); expect(suggestions.suggestedEvents[0].bookingUrl).toBe("https://example.test/tickets");
  const event = suggestions.suggestedEvents[0]; expect(event.status).toBe("SCHEDULED");
  const linked = await createBooking(owner.id, tripId, { eventId: event.id, title: event.title, category: "EXPERIENCE", status: "TO_BOOK", currency: "EUR", date: event.date });
  await setEventStatus(owner.id, tripId, event.id, "HIDDEN", "SCHEDULED");
  expect((await listBookings(owner.id, tripId)).bookings).toHaveLength(0); expect((await listBookings(owner.id, tripId)).suggestedEvents).toHaveLength(0);
  expect(await prisma.booking.count({ where: { id: linked.id } })).toBe(1);
  await setEventStatus(owner.id, tripId, event.id, "SCHEDULED", "HIDDEN");
  expect((await listBookings(owner.id, tripId)).bookings).toHaveLength(1);
  const ownerPacking = await getPacking(owner.id, tripId); const custom = ownerPacking.personal.find(p => p.label === "Light linen layer")!; expect(custom.reason).toContain("May");
  const member = await makeUser("Member"); await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "VIEWER" } });
  expect((await getPacking(member.id, tripId)).personal.some(p => p.label === custom.label)).toBe(true);
  await removePackingItem(member.id, tripId, (await getPacking(member.id, tripId)).personal.find(p => p.label === custom.label)!.id);
  expect((await getPacking(member.id, tripId)).personal.some(p => p.label === custom.label)).toBe(false);
});
it("retries interrupted packing without regenerating or reapplying the saved itinerary", async () => {
  const { owner, tripId } = await fixture(true); const calls: string[] = []; const generate = generator(calls, true);
  const q = await prisma.generationJob.findFirstOrThrow({ where: { tripId, kind: "questions" } }); await claimJob(q.id); await runJob(q.id, generate);
  const { jobId } = await startOnboardingPlan(owner.id, tripId, { answers, note: null }); await claimJob(jobId); await runJob(jobId, generate);
  const finish = await prisma.generationJob.findFirstOrThrow({ where: { tripId, kind: "setup" } }); await claimJob(finish.id); await runJob(finish.id, generate);
  expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: finish.id } })).status).toBe("FAILED");
  const versions = await prisma.itineraryVersion.count({ where: { tripId } });
  await retryOnboarding(owner.id, tripId); await claimJob(finish.id); await runJob(finish.id, generator(calls));
  expect(calls.filter(c => c === "trip_plan")).toHaveLength(1);
  expect(await prisma.itineraryVersion.count({ where: { tripId } })).toBe(versions);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).onboardingStage).toBe("COMPLETE");
});

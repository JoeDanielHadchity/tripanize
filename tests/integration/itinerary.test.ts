import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addStop, deleteStop, getItinerary, moveStop, reorderStops, restoreVersion, updateStop, listVersions } from "@/server/itinerary/service";
import { createBooking, updateBooking, setBookingStatus } from "@/server/bookings/service";
import { createExpense, updateExpense } from "@/server/expenses/service";
import { addCustomEvent, eventDedupeKey, previewScheduleEvent, scheduleEvent, upsertDiscoveredEvents } from "@/server/events/service";
import { applyProposal } from "@/server/planner/apply";
import { runJob, claimJob } from "@/server/planner/run";
import { AIError } from "@/server/ai/openai";
import type { Proposal } from "@/server/planner/schema";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const owner = await makeUser("Ana");
  const tripId = await makeTrip(owner.id, { commitments: [{ title: "Friend's wedding", date: "2027-05-02", startTime: "15:00", durationMin: 300 }] });
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  return { owner, tripId, days };
}

describe("itinerary editing", () => {
  it("reorders stops and recalculates flexible times", async () => {
    const { owner, tripId, days } = await setup();
    const d = days[0];
    const a = await addStop(owner.id, tripId, { dayId: d.id, input: { title: "A", startTime: "09:00", durationMin: 60, travelToNextMin: 15 } });
    const b = await addStop(owner.id, tripId, { dayId: d.id, input: { title: "B", startTime: "10:15", durationMin: 90, travelToNextMin: 15 } });
    const c = await addStop(owner.id, tripId, { dayId: d.id, input: { title: "C", startTime: "12:00", durationMin: 60 } });
    const preview = await reorderStops(owner.id, tripId, d.id, "A", [c.id, a.id, b.id], { dryRun: true });
    expect(preview.impact.moved.length).toBeGreaterThan(0);
    expect((await prisma.stop.findUniqueOrThrow({ where: { id: c.id } })).position).toBe(2); // dry run wrote nothing
    await reorderStops(owner.id, tripId, d.id, "A", [c.id, a.id, b.id]);
    const stops = await prisma.stop.findMany({ where: { dayId: d.id }, orderBy: { position: "asc" } });
    expect(stops.map((s) => [s.title, s.startTime])).toEqual([["C", "09:00"], ["A", "10:00"], ["B", "11:15"]]);
    await expect(reorderStops(owner.id, tripId, d.id, "A", [a.id, b.id])).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("protects fixed commitments: moving, retiming or deleting needs confirmation, and conflicts are reported", async () => {
    const { owner, tripId, days } = await setup();
    const wedding = await prisma.stop.findFirstOrThrow({ where: { tripId, isFixed: true } });
    expect(wedding.dayId).toBe(days[1].id);
    await expect(moveStop(owner.id, tripId, wedding.id, { dayId: days[2].id }, { version: wedding.version })).rejects.toMatchObject({ code: "CONFLICT", details: { needsConfirmation: true } });
    await expect(updateStop(owner.id, tripId, wedding.id, { startTime: "16:00" }, { version: wedding.version })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(deleteStop(owner.id, tripId, wedding.id)).rejects.toMatchObject({ code: "CONFLICT" });

    // A flexible stop that runs into the wedding is flagged, and the wedding does not move.
    const lunch = await addStop(owner.id, tripId, { dayId: days[1].id, input: { title: "Long lunch", startTime: "13:00", durationMin: 60 } });
    const r = await updateStop(owner.id, tripId, lunch.id, { durationMin: 180 }, { version: lunch.version, dryRun: true });
    expect(r.impact?.conflicts.some((c) => /wedding/i.test(c.message))).toBe(true);
    await updateStop(owner.id, tripId, lunch.id, { durationMin: 180 }, { version: lunch.version });
    expect((await prisma.stop.findUniqueOrThrow({ where: { id: wedding.id } })).startTime).toBe("15:00");
  });

  it("detects concurrent edits with version checks", async () => {
    const { owner, tripId, days } = await setup();
    const s = await addStop(owner.id, tripId, { dayId: days[0].id, input: { title: "Café" } });
    await updateStop(owner.id, tripId, s.id, { title: "Café A Brasileira" }, { version: s.version });
    await expect(updateStop(owner.id, tripId, s.id, { title: "Stale edit" }, { version: s.version })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await prisma.stop.findUniqueOrThrow({ where: { id: s.id } })).title).toBe("Café A Brasileira");
    const t = await prisma.traveler.findFirstOrThrow({ where: { tripId, userId: owner.id } });
    const e = await createExpense(owner.id, tripId, { description: "Taxi", category: "Transport", amount: "20", currency: "EUR", date: "2027-05-01", payerId: t.id, method: "SINGLE", participants: [{ travelerId: t.id }] });
    await updateExpense(owner.id, tripId, e.id, { description: "Taxi", category: "Transport", amount: "25", currency: "EUR", date: "2027-05-01", payerId: t.id, method: "SINGLE", participants: [{ travelerId: t.id }] }, e.version);
    await expect(updateExpense(owner.id, tripId, e.id, { description: "Taxi", category: "Transport", amount: "30", currency: "EUR", date: "2027-05-01", payerId: t.id, method: "SINGLE", participants: [{ travelerId: t.id }] }, e.version)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.auditLog.count({ where: { tripId, entity: "expense" } })).toBe(2);
  });

  it("unscheduled ideas stay out of days until moved onto a date", async () => {
    const { owner, tripId, days } = await setup();
    const idea = await addStop(owner.id, tripId, { dayId: null, input: { title: "Fado night" } });
    const it1 = await getItinerary(owner.id, tripId);
    expect(it1.ideas.map((i) => i.title)).toEqual(["Fado night"]);
    expect(it1.days.flatMap((d) => d.stops).some((s) => s.title === "Fado night")).toBe(false);
    await moveStop(owner.id, tripId, idea.id, { dayId: days[2].id }, { version: idea.version });
    const it2 = await getItinerary(owner.id, tripId);
    expect(it2.ideas).toEqual([]);
    expect(it2.days[2].stops.map((s) => s.title)).toContain("Fado night");
  });
});

describe("canonical bookings", () => {
  it("a booking appears once in its day and stays in sync; undated or cancelled bookings never appear", async () => {
    const { owner, tripId, days } = await setup();
    const b = await createBooking(owner.id, tripId, { title: "Tram 28 tour", category: "EXPERIENCE", status: "BOOKED", date: "2027-05-01", startTime: "10:00", durationMin: 90, currency: "EUR", estCost: "40" });
    let proj = await prisma.stop.findMany({ where: { bookingId: b.id } });
    expect(proj).toHaveLength(1);
    expect(proj[0].dayId).toBe(days[0].id);

    const updated = await updateBooking(owner.id, tripId, b.id, { title: "Tram 28 tour (morning)", category: "EXPERIENCE", status: "BOOKED", date: "2027-05-03", startTime: "09:30", durationMin: 90, currency: "EUR" }, b.version);
    proj = await prisma.stop.findMany({ where: { bookingId: b.id } });
    expect(proj).toHaveLength(1);
    expect(proj[0].dayId).toBe(days[2].id);
    const view = await getItinerary(owner.id, tripId);
    const s = view.days[2].stops.find((x) => x.bookingId === b.id)!;
    expect(s.booking!.title).toBe("Tram 28 tour (morning)"); // rendered from the same record

    // Moving the projection in the itinerary changes the booking date (with confirmation since it's booked).
    await expect(moveStop(owner.id, tripId, s.id, { dayId: days[0].id }, { version: s.version })).rejects.toMatchObject({ code: "CONFLICT" });
    await moveStop(owner.id, tripId, s.id, { dayId: days[0].id }, { version: s.version, confirm: true });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).date).toBe("2027-05-01");

    const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
    await setBookingStatus(owner.id, tripId, b.id, "CANCELLED", fresh.version);
    expect(await prisma.stop.count({ where: { bookingId: b.id } })).toBe(0);
    const undated = await createBooking(owner.id, tripId, { title: "Sintra palace", category: "ATTRACTION", status: "TO_BOOK", currency: "EUR" });
    expect(await prisma.stop.count({ where: { bookingId: undated.id } })).toBe(0);
    void updated;
  });
});

function fakeProposal(dates: string[], title = "Belém Tower"): Proposal {
  return {
    summary: "Plan",
    unplacedMustSees: [],
    generalNotes: [],
    days: dates.map((date) => ({
      date, area: "Belém", title: `Day ${date}`, isTravelDay: false, driveMinutes: null, planBNote: null, notes: ["Buy a Viva Viagem card"], questions: [], estCost: 50,
      stops: [{ title: `${title} ${date}`, category: "sight", locationName: "Belém Tower", address: "Av. Brasília", lat: 38.69, lng: -9.21, reason: "Iconic", startTime: "10:00", durationMin: 90, travelToNextMin: 10, travelMode: "walking", travelNote: null, estCost: 20, bookingRequired: false, bookingNote: null, hoursNote: "Closed Mondays", hoursVerified: false, officialUrl: "https://www.museusemonumentos.pt", sourceUrls: [], isMeal: false, isFreeTime: false, indoor: false }],
      planB: [],
    })),
  };
}

describe("AI planning jobs", () => {
  it("applying selected days keeps fixed items, other days and versions; regeneration of one day is undoable", async () => {
    const { owner, tripId, days } = await setup();
    const manual = await addStop(owner.id, tripId, { dayId: days[3].id, input: { title: "My own plan" } });
    const job = await prisma.generationJob.create({ data: { tripId, kind: "full", params: {}, requestedById: owner.id } });
    expect(await claimJob(job.id)).toBe(true);
    expect(await claimJob(job.id)).toBe(false); // duplicate workers can't double-run
    const dates = days.map((d) => d.date);
    await runJob(job.id, async () => ({ data: fakeProposal(dates), model: "test", sources: [], usage: null }) as never);
    const done = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe("SUCCEEDED");
    // Nothing is saved to the itinerary until the travelers accept.
    expect(await prisma.stop.count({ where: { tripId, origin: "AI" } })).toBe(0);

    await applyProposal(owner.id, tripId, job.id, [dates[0], dates[1]]);
    const view = await getItinerary(owner.id, tripId);
    expect(view.days[0].stops.map((s) => s.title)).toEqual(["Belém Tower 2027-05-01"]);
    expect(view.days[0].stops[0].status).toBe("SUGGESTED");
    expect(view.days[1].stops.map((s) => s.title)).toEqual(["Belém Tower 2027-05-02", "Friend's wedding"]);
    expect(view.days[3].stops.map((s) => s.title)).toEqual(["My own plan"]); // unaccepted day untouched
    expect(manual).toBeTruthy();

    // Regenerate a single day, then undo it from the version history.
    const regen = await prisma.generationJob.create({ data: { tripId, kind: "days", params: { dates: [dates[0]] }, requestedById: owner.id } });
    await claimJob(regen.id);
    await runJob(regen.id, async () => ({ data: fakeProposal([dates[0]], "LX Factory"), model: "test", sources: [], usage: null }) as never);
    await applyProposal(owner.id, tripId, regen.id, [dates[0]]);
    expect((await getItinerary(owner.id, tripId)).days[0].stops[0].title).toBe("LX Factory 2027-05-01");
    const versions = await listVersions(owner.id, tripId);
    await restoreVersion(owner.id, tripId, versions[0].id);
    expect((await getItinerary(owner.id, tripId)).days[0].stops[0].title).toBe("Belém Tower 2027-05-01");
  });

  it("a failed AI request never changes the existing itinerary", async () => {
    const { owner, tripId, days } = await setup();
    await addStop(owner.id, tripId, { dayId: days[0].id, input: { title: "Existing stop", startTime: "09:00" } });
    const before = await prisma.stop.findMany({ where: { tripId }, orderBy: { id: "asc" } });
    for (const err of [new AIError("TIMEOUT", "timed out"), new AIError("INVALID_RESPONSE", "bad json"), new AIError("RATE_LIMITED", "429")]) {
      const job = await prisma.generationJob.create({ data: { tripId, kind: "full", params: {}, requestedById: owner.id } });
      await claimJob(job.id);
      await runJob(job.id, async () => {
        throw err;
      });
      const j = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
      expect(j.status).toBe("FAILED");
      expect(j.errorCode).toBe(err.code);
    }
    const after = await prisma.stop.findMany({ where: { tripId }, orderBy: { id: "asc" } });
    expect(after).toEqual(before);
  });

  it("keeps partial results when a later chunk fails", async () => {
    const owner = await makeUser("Ana");
    const tripId = await makeTrip(owner.id, { startDate: "2027-06-01", endDate: "2027-06-08" });
    const job = await prisma.generationJob.create({ data: { tripId, kind: "full", params: {}, requestedById: owner.id } });
    await claimJob(job.id);
    let call = 0;
    await runJob(job.id, async (opts) => {
      call++;
      if (call === 2) throw new AIError("TIMEOUT", "timed out");
      const dates = JSON.parse(opts.input.replace(/^[\s\S]*<trip_data>\n/, "").replace(/\n<\/trip_data>$/, "")).datesToPlan as string[];
      return { data: fakeProposal(dates), model: "test", sources: [], usage: null } as never;
    });
    const j = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(j.status).toBe("FAILED");
    expect((j.proposal as unknown as Proposal).days).toHaveLength(5);
  });
});

describe("events", () => {
  it("deduplicates discoveries, records material changes, and schedules with conflict review", async () => {
    const { owner, tripId, days } = await setup();
    const ev = { title: "Lisbon Book Fair 2027", category: "festival", date: "2027-05-02", startTime: "14:00", endDate: null, dateVerified: true, venue: "Parque Eduardo VII", city: "Lisbon", address: null, officialUrl: "https://feiradolivrodelisboa.pt", bookingUrl: null, priceText: "Free", availability: null, bookingDeadline: null, whyFits: "You like books", uncertainty: null, cancelled: false, soldOut: false, sources: [{ url: "https://feiradolivrodelisboa.pt", title: "Official" }] };
    const r1 = await upsertDiscoveredEvents(tripId, [ev, { ...ev, title: "The Lisbon Book Fair" }]);
    expect(r1.added).toBe(1);
    expect(eventDedupeKey(ev)).toBe(eventDedupeKey({ title: "lisbon book fair", city: "Lisbon" }));
    const r2 = await upsertDiscoveredEvents(tripId, [ev]);
    expect(r2.changed).toBe(0); // unchanged → no change, no repeat notifications
    const r3 = await upsertDiscoveredEvents(tripId, [{ ...ev, date: "2027-05-03", venue: "Praça do Comércio" }]);
    expect(r3.changedEvents[0].changes.map((c) => c.type).sort()).toEqual(["date", "venue"]);
    expect(await prisma.tripEvent.count({ where: { tripId } })).toBe(1);
    // New discoveries are only in the shortlist, never auto-added to the itinerary.
    expect(await prisma.stop.count({ where: { tripId, eventId: { not: null } } })).toBe(0);

    const event = await prisma.tripEvent.findFirstOrThrow({ where: { tripId } });
    const preview = await previewScheduleEvent(owner.id, tripId, event.id, days[1].id, "14:00", 120);
    expect(preview.conflicts.some((c) => /wedding/i.test(c.message))).toBe(true);
    expect(preview.warnings.some((w) => /2027-05-03/.test(w))).toBe(true);
    await scheduleEvent(owner.id, tripId, event.id, days[2].id, "11:00", 120);
    expect((await prisma.tripEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("SCHEDULED");
    await expect(scheduleEvent(owner.id, tripId, event.id, days[2].id, "11:00", 120)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(addCustomEvent(owner.id, tripId, { title: "Lisbon book fair", city: "Lisbon" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { MEALS, readMealOptions, type DayMeals, type RestaurantOption } from "@/lib/meal-options";
import { restaurantRefs } from "@/lib/restaurant-diversity";
import { claimJob, runJob, type Generator, type PlanCheckpoint } from "@/server/planner/run";
import { applyProposal } from "@/server/planner/apply";
import { restaurantRefreshState } from "@/server/planner/restaurant-refresh";
import { addStop, getItinerary, listVersions, restoreVersion } from "@/server/itinerary/service";
import { buildContext } from "@/server/planner/context";
import type { Proposal } from "@/server/planner/schema";
import { makeTrip, makeUser, resetDb } from "./helpers";

vi.mock("@/server/weather/trip", () => ({
  ensureDestinationCoords: async (tripId: string) => prisma.destination.findMany({ where: { tripId }, orderBy: { position: "asc" } }),
  getTripWeather: async () => ({ byDate: {}, unavailable: [] }),
}));
beforeEach(resetDb);
const sources = ["https://guide.example/food", "https://local.example/restaurants", "https://reviews.example/cafes"];
const option = (name: string, meal = 0): RestaurantOption => ({ name, cuisine: "Local", area: "City", address: null, whyFits: "Vegetarian and within the meal budget", pricePerPerson: null, officialUrl: null, sourceUrls: [sources[meal]], hoursNote: "Check opening hours" });
const choices = (date: string): DayMeals => Object.fromEntries(MEALS.map((meal, index) => [meal, [option(`${date} ${meal} one`, index), option(`${date} ${meal} two`, index)]])) as DayMeals;
const day = (date: string) => ({ date, title: "Explore", area: "City", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null, meals: { breakfast: [option("Repeat cafe")], lunch: [option("Repeat cafe")], dinner: [option("Repeat cafe")] } });
const tripData = (input: string) => JSON.parse(input.match(/<trip_data>\n([\s\S]*?)\n<\/trip_data>/)![1]);
const researchData = (input: string) => JSON.parse(input.match(/<restaurant_research>\n([\s\S]*?)\n<\/restaurant_research>/)![1]);
async function fixture(length = 9) {
  const owner = await makeUser("DiverseFood");
  const tripId = await makeTrip(owner.id, { startDate: "2020-05-01", endDate: `2020-05-${String(length).padStart(2, "0")}`, mustSee: [] });
  return { owner, tripId };
}

describe("restaurant research and safe refresh", () => {
  it("repairs a repetitive nine-day trip to 54 distinct choices, including after a durable restart", async () => {
    const { owner, tripId } = await fixture();
    await prisma.trip.update({ where: { id: tripId }, data: { planPrefs: { answers: [{ q: "Food?", a: ["Vegetarian"] }], foodNotes: "No sesame" } } });
    const job = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "full", params: {} } });
    await claimJob(job.id);
    let saved: PlanCheckpoint | undefined;
    const checkpoints = { load: async () => saved, save: async (value: PlanCheckpoint) => { saved = structuredClone(value); } };
    let plans = 0, researches = 0;
    const generate = (async (opts: { name: string; input: string; webSearch?: boolean; metering?: { tripId: string } }) => {
      const data = tripData(opts.input);
      expect(opts.webSearch).toBe(true); expect(opts.metering?.tripId).toBe(tripId);
      expect(data.travelerPreferences.foodNotes).toBe("No sesame");
      if (opts.name === "trip_plan") {
        if (++plans === 2) expect(data.excludedRestaurants.map((r: any) => r.name)).toContain("2020-05-01 dinner two");
        return { data: { summary: "Trip", days: data.datesToPlan.map(day), generalNotes: [], unplacedMustSees: [] }, model: "stub", sources: [sources[0]], usage: null };
      }
      researches++;
      expect(opts.name).toBe("trip_restaurants");
      const research = researchData(opts.input);
      const days = [...new Set(research.remainingSlots.map((s: any) => s.date))] as string[];
      return { data: { days: days.map(date => ({ date, meals: choices(date) })), researchSources: sources }, model: "stub", sources, usage: null };
    }) as Generator;
    await runJob(job.id, generate, checkpoints);
    expect(saved?.completedDates).toHaveLength(5);
    await runJob(job.id, generate, checkpoints);
    const completed = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(completed.status).toBe("SUCCEEDED");
    const proposal = completed.proposal as unknown as Proposal;
    const names = proposal.days.flatMap(d => restaurantRefs(d.meals).map(r => r.name));
    expect(names).toHaveLength(54); expect(new Set(names).size).toBe(54);
    expect(plans).toBe(2); expect(researches).toBe(2);
    await applyProposal(owner.id, tripId, job.id, proposal.days.map(d => d.date));
    expect((await getItinerary(owner.id, tripId)).days.flatMap(d => restaurantRefs(d.mealOptions))).toHaveLength(54);
  });

  it("includes unchanged-day choices in exclusions and rechecks stale drafts inside the apply transaction", async () => {
    const { owner, tripId } = await fixture(2);
    const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
    await prisma.itineraryDay.update({ where: { id: days[1].id }, data: { mealOptions: choices("Elsewhere") } });
    expect((await buildContext(tripId, [days[0].date])).restaurantExclusions).toHaveLength(6);
    const job = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "days", status: "SUCCEEDED", params: {}, proposal: { summary: "Old draft", days: [{ ...day(days[0].date), meals: choices("Elsewhere") }], generalNotes: [], unplacedMustSees: [] } } });
    await applyProposal(owner.id, tripId, job.id, [days[0].date]);
    expect(restaurantRefs((await prisma.itineraryDay.findUniqueOrThrow({ where: { id: days[0].id } })).mealOptions)).toHaveLength(0);
    expect(restaurantRefs((await prisma.itineraryDay.findUniqueOrThrow({ where: { id: days[1].id } })).mealOptions)).toHaveLength(6);
  });

  it("refreshes only food, preserves manual activities, and supports undo", async () => {
    const { owner, tripId } = await fixture(2);
    const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
    const manual = await addStop(owner.id, tripId, { dayId: days[0].id, input: { title: "My manual activity", startTime: "09:00" } });
    await prisma.itineraryDay.update({ where: { id: days[0].id }, data: { mealOptions: choices("Original") } });
    const hash = (await restaurantRefreshState(prisma, tripId)).hash;
    const job = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "restaurants", params: { restaurantBaseHash: hash } } });
    await claimJob(job.id);
    await runJob(job.id, (async (opts: { name: string; input: string }) => {
      expect(opts.name).toBe("trip_restaurants");
      const data = tripData(opts.input);
      return { data: { days: data.datesToPlan.map((date: string) => ({ date, meals: choices(date) })), researchSources: sources }, model: "stub", sources, usage: null };
    }) as Generator);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SUCCEEDED");
    expect(await prisma.stop.findUniqueOrThrow({ where: { id: manual.id } })).toEqual(manual);
    expect(restaurantRefs((await getItinerary(owner.id, tripId)).days[0].mealOptions)[0].name).toContain("2020-05-01");
    const [version] = await listVersions(owner.id, tripId);
    await restoreVersion(owner.id, tripId, version.id);
    expect(readMealOptions((await getItinerary(owner.id, tripId)).days[0].mealOptions).breakfast[0].name).toBe("Original breakfast one");
  });

  it("does not overwrite concurrent edits while restaurant research is running", async () => {
    const { owner, tripId } = await fixture(1);
    const hash = (await restaurantRefreshState(prisma, tripId)).hash;
    const job = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "restaurants", params: { restaurantBaseHash: hash } } });
    await claimJob(job.id);
    await runJob(job.id, (async (opts: { input: string }) => {
      await prisma.itineraryDay.updateMany({ where: { tripId }, data: { notes: "New manual notes", version: { increment: 1 } } });
      const data = tripData(opts.input);
      return { data: { days: data.datesToPlan.map((date: string) => ({ date, meals: choices(date) })), researchSources: sources }, model: "stub", sources, usage: null };
    }) as Generator);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("FAILED");
    const saved = await prisma.itineraryDay.findFirstOrThrow({ where: { tripId } });
    expect(saved.notes).toBe("New manual notes"); expect(restaurantRefs(saved.mealOptions)).toHaveLength(0);
  });

  it("bounds replacement searches and leaves honest gaps rather than duplicates or invented links", async () => {
    const { owner, tripId } = await fixture(2);
    const job = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "full", params: {} } });
    await claimJob(job.id);
    let researchCalls = 0;
    await runJob(job.id, (async (opts: { name: string; input: string }) => {
      const data = tripData(opts.input);
      if (opts.name === "trip_plan") return { data: { summary: "Trip", days: data.datesToPlan.map(day), generalNotes: [], unplacedMustSees: [] }, model: "stub", sources: [sources[0]], usage: null };
      researchCalls++;
      return { data: { days: data.datesToPlan.map((date: string) => ({ date, meals: { breakfast: [option("Repeat cafe")], lunch: [{ ...option("Invented link"), sourceUrls: ["https://not-observed.example/food"] }], dinner: [option("Repeat cafe")] } })), researchSources: ["https://not-observed.example/food"] }, model: "stub", sources: [sources[0]], usage: null };
    }) as Generator);
    const result = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    const proposal = result.proposal as unknown as Proposal;
    expect(researchCalls).toBe(2);
    expect(proposal.days.flatMap(d => restaurantRefs(d.meals).map(r => r.name))).toEqual(["Repeat cafe"]);
    expect(proposal.days.every(d => d.questions.some(q => /No restaurant was repeated/.test(q)))).toBe(true);
    expect(proposal.days[0].questions.some(q => /three independent websites/.test(q))).toBe(true);
  });

  it("stops after one research pass once every meal is filled, and reports thin sources instead of paying again", async () => {
    const { owner, tripId } = await fixture(2);
    const job = await prisma.generationJob.create({ data: { tripId, requestedById: owner.id, kind: "full", params: {} } });
    await claimJob(job.id);
    let researchCalls = 0;
    const oneSite = (o: RestaurantOption) => ({ ...o, sourceUrls: [sources[0]] });
    await runJob(job.id, (async (opts: { name: string; input: string }) => {
      const data = tripData(opts.input);
      if (opts.name === "trip_plan") return { data: { summary: "Trip", days: data.datesToPlan.map(day), generalNotes: [], unplacedMustSees: [] }, model: "stub", sources: [sources[0]], usage: null };
      researchCalls++;
      const research = researchData(opts.input);
      const dates = [...new Set(research.remainingSlots.map((s: any) => s.date))] as string[];
      return { data: { days: dates.map(date => ({ date, meals: Object.fromEntries(Object.entries(choices(date)).map(([meal, list]) => [meal, list.map(oneSite)])) })), researchSources: [sources[0]] }, model: "stub", sources: [sources[0]], usage: null };
    }) as Generator);
    const proposal = (await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).proposal as unknown as Proposal;
    expect(researchCalls).toBe(1);
    expect(proposal.days.flatMap(d => restaurantRefs(d.meals))).toHaveLength(12);
    expect(proposal.days[0].questions.some(q => /three independent websites/.test(q))).toBe(true);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { MEALS, readMealOptions, type DayMeals } from "@/lib/meal-options";
import { FOOD_QUESTIONS, STANDARD_QUESTIONS, getPlanQuestions, savePlanPrefs } from "@/server/planner/questions";
import { buildContext } from "@/server/planner/context";
import { buildPlannerInput } from "@/server/planner/prompt";
import { claimJob, runJob, type Generator } from "@/server/planner/run";
import { loadAssistantState, previewAssistantEdits } from "@/server/assistant/edits";
import { applyProposal } from "@/server/planner/apply";
import { getItinerary, listVersions, restoreVersion } from "@/server/itinerary/service";
import { exportTripJson } from "@/server/export";
import { makeTrip, makeUser, resetDb } from "./helpers";

vi.mock("@/server/weather/trip", () => ({
  ensureDestinationCoords: async (tripId: string) => prisma.destination.findMany({ where: { tripId }, orderBy: { position: "asc" } }),
  getTripWeather: async () => ({ byDate: {}, unavailable: [] }),
}));
beforeEach(resetDb);
const meals: DayMeals = Object.fromEntries(MEALS.map(meal => [meal, [1, 2].map(n => ({ name: `${meal} choice ${n}`, cuisine: "Local", area: "Old town", address: "Old town, Lisbon", whyFits: "A vegetarian-friendly local option near your route", pricePerPerson: 15, officialUrl: "https://restaurant.example/menu", sourceUrls: ["https://restaurant.example/menu"], hoursNote: "Opening hours not verified" }))])) as DayMeals;

async function fixture() {
  const owner = await makeUser("FoodPlanner");
  const tripId = await makeTrip(owner.id, { startDate: "2020-05-01", endDate: "2020-05-02", mustSee: [] });
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  return { owner, tripId, days };
}

describe("food preferences and daily restaurant options", () => {
  it("upgrades cached questionnaires, preserves every answer and supplies food notes to the planner", async () => {
    const { owner, tripId } = await fixture();
    await prisma.trip.update({ where: { id: tripId }, data: { planQuestions: { source: "ai", questions: [{ id: "pace", q: "Your pace?", multi: false, options: ["Slow", "Busy"] }] } } });
    const set = await getPlanQuestions(owner.id, tripId, { cachedOnly: true });
    expect(set.questions.filter(q => q.section === "food").map(q => q.id)).toEqual(FOOD_QUESTIONS.map(q => q.id));
    expect(set.questions.some(q => q.q === "Your pace?")).toBe(true);
    expect(await prisma.generationJob.count({ where: { tripId } })).toBe(0);
    const answers = [...STANDARD_QUESTIONS, { id: "extra", q: "Anything special?", multi: false, options: ["Music"] }].map(q => ({ q: q.q, a: [q.options[0]] }));
    await savePlanPrefs(owner.id, tripId, { answers, note: null, foodNotes: "Severe sesame allergy; vegetarian lunches" });
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect((trip.planPrefs as any).answers).toHaveLength(11);
    const context = await buildContext(tripId, null);
    expect(buildPlannerInput(context, { chunkDates: context.dates, previouslyPlanned: [] })).toContain("Severe sesame allergy; vegetarian lunches");
  });

  it("generates, applies and restores six choices a day without creating bookings or spendings", async () => {
    const { owner, tripId, days } = await fixture();
    await prisma.itineraryDay.update({ where: { id: days[0].id }, data: { mealOptions: { ...meals, breakfast: [{ ...meals.breakfast[0], name: "Original cafe" }] } } });
    const job = await prisma.generationJob.create({ data: { tripId, kind: "full", params: {}, requestedById: owner.id } });
    await claimJob(job.id);
    const generate = (async (opts: { input: string }) => {
      const input = JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]);
      return { data: { summary: "Food-aware trip", generalNotes: [], unplacedMustSees: [], days: input.datesToPlan.map((date: string) => ({ date, title: "Explore", area: "Lisbon", isTravelDay: false, driveMinutes: null, stops: [], planB: [], planBNote: null, notes: [], questions: [], estCost: null, meals })) }, model: "isolated", sources: ["https://restaurant.example/menu"], usage: null };
    }) as unknown as Generator;
    await runJob(job.id, generate);
    expect((await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("SUCCEEDED");
    await applyProposal(owner.id, tripId, job.id, days.map(d => d.date));
    for (const day of (await getItinerary(owner.id, tripId)).days) for (const meal of MEALS) expect(readMealOptions(day.mealOptions)[meal]).toHaveLength(2);
    expect(await prisma.booking.count({ where: { tripId } })).toBe(0);
    expect(await prisma.expense.count({ where: { tripId } })).toBe(0);
    expect(await prisma.stop.count({ where: { tripId } })).toBe(0);
    const exported = await exportTripJson(owner.id, tripId);
    expect(readMealOptions(exported.trip.days[0].mealOptions).dinner).toHaveLength(2);
    const [version] = await listVersions(owner.id, tripId);
    await restoreVersion(owner.id, tripId, version.id);
    expect(readMealOptions((await getItinerary(owner.id, tripId)).days[0].mealOptions).breakfast[0].name).toBe("Original cafe");
    const state = await loadAssistantState(prisma, tripId);
    const swapped = previewAssistantEdits(state, [{ type: "swap_days", date: days[0].date, otherDate: days[1].date }]);
    expect(readMealOptions(swapped.days.find(d => d.id === days[1].id)?.mealOptions).breakfast[0].name).toBe("Original cafe");
    const outsider = await makeUser("FoodOutsider");
    await expect(savePlanPrefs(outsider.id, tripId, { answers: [], note: null, foodNotes: "Changed" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

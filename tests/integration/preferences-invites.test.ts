import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { createInvitation, listPendingInvitations, acceptInvitationById, declineInvitation } from "@/server/invitations/service";
import { getPlanQuestions, savePlanPrefs, STANDARD_QUESTIONS } from "@/server/planner/questions";
import { buildContext } from "@/server/planner/context";
import { buildPlannerInput } from "@/server/planner/prompt";
import { makeTrip, makeUser, resetDb } from "./helpers";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";

const runtime = currentRuntime();
beforeEach(resetDb);
afterEach(() => setTestRuntime(runtime));

describe("pre-planning questions", () => {
  it("falls back to standard questions without AI, and saved answers reach the planner input", async () => {
    const owner = await makeUser("Ana");
    const viewer = await makeUser("Vic");
    const tripId = await makeTrip(owner.id);
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const set = await getPlanQuestions(owner.id, tripId);
      expect(set.source).toBe("standard");
      expect(set.questions).toEqual(STANDARD_QUESTIONS);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
    await expect(getPlanQuestions(viewer.id, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(savePlanPrefs(owner.id, tripId, { answers: [], note: null })).rejects.toMatchObject({ code: "VALIDATION" });

    await savePlanPrefs(owner.id, tripId, { answers: [{ q: "How full should your days be?", a: ["Slow and relaxed"] }], note: "One beach afternoon" });
    const ctx = await buildContext(tripId, null);
    const input = buildPlannerInput(ctx, { chunkDates: ctx.dates.slice(0, 2), previouslyPlanned: [] });
    const data = JSON.parse(input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1]);
    expect(data.travelerPreferences).toEqual({ answers: [{ question: "How full should your days be?", chosen: ["Slow and relaxed"] }], extraNote: "One beach afternoon" });

    await savePlanPrefs(owner.id, tripId, null);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).planPrefs).toBeNull();
  });
});

describe("invitations on the home screen", () => {
  it("uses the runtime app URL and returns a www production link", async () => {
    setTestRuntime({ ...runtime, appUrl: "https://tripanize.app/" });
    const owner = await makeUser("Ana");
    const tripId = await makeTrip(owner.id);
    const inv = await createInvitation(owner.id, tripId, { role: "VIEWER" });
    const url = new URL(inv.url);
    expect(url.origin).toBe("https://www.tripanize.app");
    expect(url.pathname).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);
  });

  it("lists open email invitations for that email only; accept by id joins, decline closes it", async () => {
    const owner = await makeUser("Ana");
    const rita = await makeUser("Rita", "rita@example.test");
    const other = await makeUser("Otto");
    const tripId = await makeTrip(owner.id);
    const inv = await createInvitation(owner.id, tripId, { role: "COLLABORATOR", email: "Rita@Example.test" });
    await createInvitation(owner.id, tripId, { role: "VIEWER" }); // link-only, not addressed to anyone

    expect(await listPendingInvitations(other.id)).toEqual([]);
    const mine = await listPendingInvitations(rita.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: inv.id, tripName: "Lisbon long weekend", role: "COLLABORATOR", from: "Ana" });

    await expect(acceptInvitationById(other.id, inv.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(declineInvitation(other.id, inv.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await acceptInvitationById(rita.id, inv.id)).toEqual({ tripId });
    expect(await prisma.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId: rita.id } } })).toMatchObject({ role: "COLLABORATOR" });
    expect(await listPendingInvitations(rita.id)).toEqual([]);

    const second = await createInvitation(owner.id, tripId, { role: "VIEWER", email: "otto-x@example.test" });
    const otto2 = await makeUser("Otto2", "otto-x@example.test");
    await declineInvitation(otto2.id, second.id);
    expect(await listPendingInvitations(otto2.id)).toEqual([]);
    await expect(acceptInvitationById(otto2.id, second.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

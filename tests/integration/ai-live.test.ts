import { it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { prisma } from "@/server/db";
import { claimJob, runJob } from "@/server/planner/run";
import { applyProposal } from "@/server/planner/apply";
import { makeTrip, makeUser, resetDb } from "./helpers";
import type { Proposal } from "@/server/planner/schema";

vi.mock("@/server/weather/trip", async importOriginal => ({
  ...await importOriginal<typeof import("@/server/weather/trip")>(),
  getTripWeather: async () => ({ byDate: {}, reports: [], unavailable: ["Lisbon"] }),
}));

// Explicit opt-in only. Normal tests never call a paid service or load a key.
it.skipIf(process.env.TRIPANIZE_LIVE_AI_CHECK !== "1")("generates and accepts a real researched one-day draft on an isolated database", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  process.env.OPENAI_API_KEY = parse(readFileSync(".env.local")).OPENAI_API_KEY;
  process.env.OPENAI_MODEL = "gpt-6.1-sol";
  try {
    await resetDb();
    const owner = await makeUser("AI verification");
    const tripId = await makeTrip(owner.id, { startDate: "2027-05-01", endDate: "2027-05-01", mustSee: [], commitments: [{ title: "Fixed lunch", date: "2027-05-01", startTime: "13:00", durationMin: 60 }] });
    await prisma.destination.updateMany({ where: { tripId }, data: { lat: 38.7, lng: -9.1 } });
    const job = await prisma.generationJob.create({ data: { tripId, kind: "full", params: { instruction: "A relaxed architecture day. Include no more than four flexible stops." }, requestedById: owner.id } });
    await claimJob(job.id);
    await runJob(job.id);
    const done = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status, done.error ?? undefined).toBe("SUCCEEDED");
    const draft = done.proposal as unknown as Proposal;
    expect(draft.days.map(d => d.date)).toEqual(["2027-05-01"]);
    expect(draft.days[0].stops.length).toBeGreaterThan(0);
    expect((done.checks as { sources: string[] }).sources.length).toBeGreaterThan(0);
    expect(await prisma.stop.count({ where: { tripId, origin: "AI" } })).toBe(0);
    await applyProposal(owner.id, tripId, job.id, ["2027-05-01"]);
    expect(await prisma.stop.count({ where: { tripId, origin: "AI" } })).toBeGreaterThan(0);
    expect(await prisma.stop.count({ where: { tripId, title: "Fixed lunch", isFixed: true } })).toBe(1);
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = previousModel;
  }
}, 180000);

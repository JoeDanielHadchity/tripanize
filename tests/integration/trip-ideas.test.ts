import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { adminTripIdeas, executeTripIdeaCommand, runTripIdeaDraft } from "@/server/admin/trip-ideas";
import { publishedTripIdeas, findPublishedIdea } from "@/server/examples/trip-ideas";
import { findExample, listExamples } from "@/server/examples/data";
import { publicMobileGuide, publicMobileHome } from "@/server/mobile/public";
import { CITY_GUIDES } from "@/server/examples/city-guides";
import type { generateStructured } from "@/server/ai/openai";
import { makeUser, resetDb, adminAuthenticationFixture } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, companyAdminEmail: "admin@example.test" }); });
afterEach(() => setTestRuntime(runtime));

async function admin() {
  const a = await makeUser("Administrator", "admin@example.test");
  await prisma.user.update({ where: { id: a.id }, data: { emailVerified: true } });
  await adminAuthenticationFixture(a.id);
  return a;
}

const draft = {
  city: "Lisbon", country: "Portugal", timezone: "Europe/Lisbon", title: "Lisbon in 2 days", subtitle: "Hills. Trams. Tarts.", intro: "A short first visit.",
  currency: "EUR", currencyNote: null, budgetRange: "EUR 300–500", budget: [{ label: "Stay · 1 night", amount: "EUR 120–200" }],
  base: "Baixa or Chiado.", transport: "Walk and use trams.", packing: "Comfortable shoes.",
  days: [1, 2].map(n => ({ title: `Day ${n}`, area: "Baixa → Alfama", pace: "Easy", note: "Check opening hours.", food: "Pastries.", planB: "Museums.", stops: [
    { time: "09:00", title: "Praça do Comércio", detail: "Start by the river.", duration: "45 min", kind: "Free", url: "https://www.visitlisboa.com/" },
    { time: "10:30", title: "Sé de Lisboa", detail: "The cathedral.", duration: "1 hr", kind: "Ticket", url: "not a link" },
  ] })),
  bookings: [{ label: "Tram 28", note: "Go early.", url: "https://www.carris.pt/" }, { label: "Bad", note: "", url: "javascript:alert(1)" }],
  sources: [{ label: "Visit Lisboa", url: "https://www.visitlisboa.com/" }],
};
const fakeGenerate = (async () => ({ data: draft, model: "test", sources: [], usage: null })) as unknown as typeof generateStructured;

it("shows the five original guides by default, in order, on the site and in the app", async () => {
  const ideas = await publishedTripIdeas();
  expect(ideas.map(i => i.slug)).toEqual(CITY_GUIDES.map(g => g.slug));
  expect((await publicMobileHome()).guides).toHaveLength(CITY_GUIDES.length);
  expect((await listExamples()).map(e => e.slug)).toEqual(["lisbon-porto", ...CITY_GUIDES.map(g => g.slug)]);
  expect(await publicMobileGuide("lisbon-porto")).not.toBeNull();
});

it("only lets the company administrator manage trip ideas", async () => {
  await admin();
  const user = await makeUser("Traveler");
  await expect(adminTripIdeas(user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(executeTripIdeaCommand(user.id, { op: "idea.status", slug: "paris", status: "HIDDEN" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("hides, reorders, edits and restores an original guide", async () => {
  const a = await admin();
  await executeTripIdeaCommand(a.id, { op: "idea.status", slug: "paris", status: "HIDDEN" });
  expect((await publishedTripIdeas()).some(i => i.slug === "paris")).toBe(false);
  expect(await findExample("paris")).toBeNull();
  expect(await publicMobileGuide("paris")).toBeNull();
  await executeTripIdeaCommand(a.id, { op: "idea.status", slug: "paris", status: "PUBLISHED" });

  await executeTripIdeaCommand(a.id, { op: "idea.move", slug: "london", direction: "up" });
  expect((await publishedTripIdeas()).map(i => i.slug).slice(0, 3)).toEqual(["bangkok", "london", "hong-kong"]);

  const london = CITY_GUIDES.find(g => g.slug === "london")!;
  await executeTripIdeaCommand(a.id, { op: "idea.save", slug: "london", guide: { ...london, slug: "something-else", title: "London, your way" } });
  const edited = await findPublishedIdea("london");
  expect(edited?.guide.title).toBe("London, your way");
  expect(edited?.guide.slug).toBe("london");
  expect((await publicMobileGuide("london"))?.title).toBe("London, your way");

  await executeTripIdeaCommand(a.id, { op: "idea.reset", slug: "london" });
  expect((await findPublishedIdea("london"))?.guide.title).toBe(london.title);
  await expect(executeTripIdeaCommand(a.id, { op: "idea.delete", slug: "london" })).rejects.toMatchObject({ code: "VALIDATION" });
});

it("drafts a new guide with AI, needs a photo before publishing, then shows it everywhere", async () => {
  const a = await admin();
  await executeTripIdeaCommand(a.id, { op: "idea.draft", city: "Lisbon", country: "Portugal", days: 2 });
  const row = await prisma.tripIdea.findUniqueOrThrow({ where: { slug: "lisbon" } });
  expect(row.status).toBe("DRAFTING");
  expect((await publishedTripIdeas()).some(i => i.slug === "lisbon")).toBe(false);

  await runTripIdeaDraft(row.id, fakeGenerate);
  const ready = (await adminTripIdeas(a.id)).find(i => i.slug === "lisbon")!;
  expect(ready.status).toBe("DRAFT");
  expect(ready.guide?.days).toHaveLength(2);
  // Unsafe or malformed links are dropped rather than published.
  expect(ready.guide?.days[0].stops[1].url).toBeUndefined();
  expect(ready.guide?.bookings.map(b => b.label)).toEqual(["Tram 28"]);

  await expect(executeTripIdeaCommand(a.id, { op: "idea.status", slug: "lisbon", status: "PUBLISHED" })).rejects.toMatchObject({ code: "VALIDATION" });
  await prisma.tripIdea.update({ where: { id: row.id }, data: { cardImageKey: "public/trip-ideas/lisbon-card-abcdef123456.webp" } });
  await executeTripIdeaCommand(a.id, { op: "idea.status", slug: "lisbon", status: "PUBLISHED" });

  const live = await findPublishedIdea("lisbon");
  expect(live?.photo.card).toBe("/api/trip-ideas/photo/lisbon-card-abcdef123456.webp");
  expect((await publicMobileHome()).guides.map(g => g.slug)).toContain("lisbon");
  expect((await publicMobileGuide("lisbon"))?.days).toHaveLength(2);
  expect((await findExample("lisbon"))?.nights).toBe(1);

  await expect(executeTripIdeaCommand(a.id, { op: "idea.delete", slug: "lisbon" })).resolves.toBeUndefined();
  expect(await findPublishedIdea("lisbon")).toBeNull();
});

it("reports a draft that was interrupted instead of paying for it again", async () => {
  const a = await admin();
  await executeTripIdeaCommand(a.id, { op: "idea.draft", city: "Porto", country: "Portugal", days: 3 });
  const row = await prisma.tripIdea.findUniqueOrThrow({ where: { slug: "porto" } });
  await prisma.tripIdea.update({ where: { id: row.id }, data: { error: "Writing…" } });
  let calls = 0;
  await runTripIdeaDraft(row.id, (async () => { calls++; throw new Error("should not run"); }) as unknown as typeof generateStructured);
  expect(calls).toBe(0);
  expect((await prisma.tripIdea.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("FAILED");
});

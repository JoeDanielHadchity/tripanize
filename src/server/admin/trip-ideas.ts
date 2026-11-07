import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { sniffAttachment } from "@/server/storage";
import type { generateStructured } from "@/server/ai/openai";
import { CITY_GUIDES, type CityGuide } from "@/server/examples/city-guides";
import { cityGuideSchema, IDEA_PHOTO_PREFIX, listTripIdeas } from "@/server/examples/trip-ideas";
import { requireCompanyAdmin } from "./identity";
import { adminAudit } from "./audit";

const slugOf = (city: string) => city.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const builtinOf = (slug: string) => CITY_GUIDES.find(g => g.slug === slug) ?? null;
const MAX_PHOTO = 8 * 1024 * 1024;

export async function adminTripIdeas(actorId: string) {
  await requireCompanyAdmin(actorId);
  return listTripIdeas({ all: true });
}

/** Rows for built-in guides are created on first change, so the shipped guide stays the default. */
async function rowFor(slug: string) {
  const row = await prisma.tripIdea.findUnique({ where: { slug } });
  if (row) return row;
  const builtin = builtinOf(slug);
  if (!builtin) throw new AppError("NOT_FOUND", "Trip idea not found.");
  const position = CITY_GUIDES.indexOf(builtin) * 10;
  return prisma.tripIdea.create({ data: { slug, city: builtin.city, country: builtin.country, builtin: true, status: "PUBLISHED", position } });
}

export const tripIdeaCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("idea.save"), slug: z.string().max(60), guide: cityGuideSchema }).strict(),
  z.object({ op: z.literal("idea.status"), slug: z.string().max(60), status: z.enum(["PUBLISHED", "HIDDEN", "DRAFT"]) }).strict(),
  z.object({ op: z.literal("idea.move"), slug: z.string().max(60), direction: z.enum(["up", "down"]) }).strict(),
  z.object({ op: z.literal("idea.reset"), slug: z.string().max(60) }).strict(),
  z.object({ op: z.literal("idea.delete"), slug: z.string().max(60) }).strict(),
  z.object({ op: z.literal("idea.draft"), city: z.string().trim().min(2).max(80), country: z.string().trim().max(80), days: z.number().int().min(2).max(6) }).strict(),
]);
export type TripIdeaCommand = z.input<typeof tripIdeaCommand>;

export async function executeTripIdeaCommand(actorId: string, input: unknown) {
  await requireCompanyAdmin(actorId);
  const c = tripIdeaCommand.parse(input);
  switch (c.op) {
    case "idea.save": {
      const row = await rowFor(c.slug);
      if (row.status === "DRAFTING") throw new AppError("CONFLICT", "The AI is still writing this guide.");
      // The address (slug) never changes once a guide exists, so links keep working.
      const guide = { ...c.guide, slug: row.slug };
      await prisma.tripIdea.update({ where: { id: row.id }, data: { content: guide, city: guide.city, country: guide.country, error: null } });
      await adminAudit(actorId, "trip_idea.save", "trip_idea", row.slug);
      return;
    }
    case "idea.status": {
      const row = await rowFor(c.slug);
      if (c.status === "PUBLISHED") {
        const ideas = await listTripIdeas({ all: true });
        const idea = ideas.find(i => i.slug === row.slug);
        if (!idea?.guide) throw new AppError("VALIDATION", "This guide has no itinerary yet. Write or draft it first.");
        if (!idea.photo) throw new AppError("VALIDATION", "Add a photo before publishing, so the guide looks right on the site and app.");
      }
      await prisma.tripIdea.update({ where: { id: row.id }, data: { status: c.status } });
      await adminAudit(actorId, "trip_idea.status", "trip_idea", row.slug, { status: c.status });
      return;
    }
    case "idea.move": {
      const ideas = await listTripIdeas({ all: true });
      const i = ideas.findIndex(x => x.slug === c.slug), j = c.direction === "up" ? i - 1 : i + 1;
      if (i < 0) throw new AppError("NOT_FOUND", "Trip idea not found.");
      if (j < 0 || j >= ideas.length) return;
      [ideas[i], ideas[j]] = [ideas[j], ideas[i]];
      // Rewrite every position so the order is explicit and stable.
      for (const [index, idea] of ideas.entries()) {
        const row = await rowFor(idea.slug);
        if (row.position !== index * 10) await prisma.tripIdea.update({ where: { id: row.id }, data: { position: index * 10 } });
      }
      await adminAudit(actorId, "trip_idea.move", "trip_idea", c.slug, { direction: c.direction });
      return;
    }
    case "idea.reset": {
      const row = await prisma.tripIdea.findUnique({ where: { slug: c.slug } });
      if (!row || !row.builtin) throw new AppError("VALIDATION", "Only the original guides can be restored.");
      await prisma.tripIdea.update({ where: { id: row.id }, data: { content: Prisma.DbNull, heroImageKey: null, cardImageKey: null, photoCredit: null, error: null } });
      await deletePhotos([row.heroImageKey, row.cardImageKey]);
      await adminAudit(actorId, "trip_idea.reset", "trip_idea", row.slug);
      return;
    }
    case "idea.delete": {
      const row = await prisma.tripIdea.findUnique({ where: { slug: c.slug } });
      if (!row) throw new AppError("NOT_FOUND", "Trip idea not found.");
      if (row.builtin) throw new AppError("VALIDATION", "Original guides can be hidden, not deleted.");
      await prisma.tripIdea.delete({ where: { id: row.id } });
      await deletePhotos([row.heroImageKey, row.cardImageKey]);
      await adminAudit(actorId, "trip_idea.delete", "trip_idea", row.slug);
      return;
    }
    case "idea.draft": {
      let slug = slugOf(c.city);
      if (!slug) throw new AppError("VALIDATION", "Enter a city name.");
      if (builtinOf(slug) || await prisma.tripIdea.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(2).toString("hex")}`;
      await prisma.tripIdea.create({ data: { slug, city: c.city, country: c.country || "", status: "DRAFTING", position: 1000, createdById: actorId, content: { request: { city: c.city, country: c.country, days: c.days } } } });
      await adminAudit(actorId, "trip_idea.draft", "trip_idea", slug, { city: c.city, days: c.days });
      await currentRuntime().wakeAi?.();
      return;
    }
  }
}

async function deletePhotos(keys: (string | null)[]) {
  for (const key of keys) if (key) await currentRuntime().files?.delete(key).catch(() => console.warn("[trip-ideas] An old photo needs cleanup."));
}

/** Card photo (shown in lists, 4:3 works best) or hero photo (top of the guide page). */
export async function uploadTripIdeaPhoto(actorId: string, slug: string, kind: "card" | "hero", file: File, credit: string) {
  await requireCompanyAdmin(actorId);
  if (!file.size || file.size > MAX_PHOTO) throw new AppError("VALIDATION", "Choose a photo up to 8 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffAttachment(buf);
  const ext = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : null;
  if (!ext) throw new AppError("VALIDATION", "Upload a JPEG, PNG or WebP photo.");
  const files = currentRuntime().files;
  if (!files) throw new AppError("NOT_CONFIGURED", "File storage is not configured.");
  const row = await rowFor(slug);
  const key = `${IDEA_PHOTO_PREFIX}${row.slug.slice(0, 40)}-${kind}-${randomBytes(6).toString("hex")}.${ext}`;
  await files.put(key, buf, { httpMetadata: { contentType: mime! } });
  const old = kind === "card" ? row.cardImageKey : row.heroImageKey;
  await prisma.tripIdea.update({ where: { id: row.id }, data: { [kind === "card" ? "cardImageKey" : "heroImageKey"]: key, photoCredit: credit.trim().slice(0, 160) || row.photoCredit } });
  await deletePhotos([old]);
  await adminAudit(actorId, "trip_idea.photo", "trip_idea", row.slug, { kind });
}

// OpenAI strict structured output: every field required, nullable where optional, plain strings for links.
const draftSchema = z.object({
  city: z.string(), country: z.string(), timezone: z.string().describe("IANA time zone, e.g. Europe/Lisbon"),
  title: z.string(), subtitle: z.string(), intro: z.string().describe("2–3 sentences"),
  currency: z.string().describe("ISO 4217 code"), currencyNote: z.string().nullable(), budgetRange: z.string().describe("Total per person, e.g. 'EUR 600–950'"),
  budget: z.array(z.object({ label: z.string().describe("e.g. 'Stay · 3 nights'"), amount: z.string() })),
  base: z.string().describe("Where to stay, by neighbourhood"), transport: z.string(), packing: z.string(),
  days: z.array(z.object({
    title: z.string(), area: z.string().describe("Areas in visiting order, joined with →"), pace: z.string(), note: z.string(),
    stops: z.array(z.object({ time: z.string().describe("HH:MM"), title: z.string(), detail: z.string(), duration: z.string().describe("e.g. '1½ hr' or '45 min'"), kind: z.string().describe("Free, Ticket, Food, Transit, Free time or Optional"), url: z.string().nullable().describe("Official page only if found via search") })),
    food: z.string(), planB: z.string(),
  })),
  bookings: z.array(z.object({ label: z.string(), note: z.string(), url: z.string() })),
  sources: z.array(z.object({ label: z.string(), url: z.string() })),
});
const httpUrl = (u: string | null | undefined) => { try { const p = new URL(u ?? ""); return ["https:", "http:"].includes(p.protocol) ? p.href.slice(0, 500) : undefined; } catch { return undefined; } };
const clip = (t: string, n: number) => t.trim().slice(0, n);
/** AI output → the stored guide shape, dropping anything that would not validate (bad links, extra items). */
function toGuide(slug: string, d: z.infer<typeof draftSchema>): CityGuide {
  const guide = {
    slug, city: clip(d.city, 80), country: clip(d.country, 80), timezone: clip(d.timezone, 60), title: clip(d.title, 120), subtitle: clip(d.subtitle, 200), intro: clip(d.intro, 1200),
    currency: /^[A-Z]{3}$/.test(d.currency) ? d.currency : "USD", ...(d.currencyNote ? { currencyNote: clip(d.currencyNote, 400) } : {}), budgetRange: clip(d.budgetRange, 80),
    budget: d.budget.slice(0, 10).map(b => [clip(b.label, 80), clip(b.amount, 80)]),
    base: clip(d.base, 800), transport: clip(d.transport, 800), packing: clip(d.packing, 800),
    days: d.days.slice(0, 7).map(day => ({ title: clip(day.title, 120), area: clip(day.area, 160), pace: clip(day.pace, 160), note: clip(day.note, 600), food: clip(day.food, 400), planB: clip(day.planB, 400),
      stops: day.stops.slice(0, 10).map(st => { const url = httpUrl(st.url); return { time: clip(st.time, 10), title: clip(st.title, 120), detail: clip(st.detail, 600), duration: clip(st.duration, 40), kind: clip(st.kind, 40), ...(url ? { url } : {}) }; }) })),
    bookings: d.bookings.flatMap(b => { const url = httpUrl(b.url); return url ? [{ label: clip(b.label, 120), note: clip(b.note, 300), url }] : []; }).slice(0, 12),
    sources: d.sources.flatMap(s => { const url = httpUrl(s.url); return url ? [{ label: clip(s.label, 120), url }] : []; }).slice(0, 15),
  };
  return cityGuideSchema.parse(guide) as CityGuide;
}

const WRITING = "Writing…";

/** Background step (durable AI task): write the first draft of a requested guide. */
export async function runTripIdeaDraft(id: string, generate: typeof generateStructured) {
  const row = await prisma.tripIdea.findUnique({ where: { id } });
  if (!row || row.status !== "DRAFTING") return;
  // An attempt interrupted by a restart is reported, not silently repeated (each attempt costs AI credit).
  if (row.error === WRITING) { await prisma.tripIdea.update({ where: { id }, data: { status: "FAILED", error: "The draft was interrupted. Delete it and try again." } }); return; }
  await prisma.tripIdea.update({ where: { id }, data: { error: WRITING } });
  const request = (row.content as { request?: { city: string; country?: string; days?: number } } | null)?.request ?? { city: row.city, country: row.country, days: 4 };
  const days = Math.min(6, Math.max(2, request.days ?? 4));
  const example = CITY_GUIDES[0];
  try {
    const result = await generate({
      schema: draftSchema,
      name: "trip_idea_draft",
      webSearch: true,
      maxOutputTokens: 16000,
      timeoutMs: 10 * 60_000,
      instructions: [
        "You write Tripanize trip ideas: honest, practical first-visit city guides for adult travelers.",
        `Write a ${days}-day guide. Each day has a clear area, a realistic pace, 4–6 stops with suggested times, a food suggestion and a plan B for bad weather or closures.`,
        "Use only places you can verify on official or reputable sites. Give official URLs for stops and bookings where they exist. Never invent prices, opening hours or reservations; say 'check before you go' when unsure.",
        "Budget: per person, sharing a room, in the local currency (ISO code), as ranges for stay, food, local transport and sights, plus a total range.",
        "Tone: warm, clear and short, like the example. Title format: '<City> in <N> days'. Subtitle: three short phrases separated by full stops.",
      ].join("\n"),
      input: `City: ${request.city}${request.country ? `, ${request.country}` : ""}\nDays: ${days}\n\nStyle example (another city, same structure):\n${JSON.stringify({ ...example, days: example.days.slice(0, 1) })}`,
    });
    const guide = toGuide(row.slug, result.data);
    await prisma.tripIdea.update({ where: { id }, data: { status: "DRAFT", content: guide, city: guide.city, country: guide.country, error: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "The AI could not write this guide.";
    await prisma.tripIdea.update({ where: { id }, data: { status: "FAILED", error: message } });
  }
}

export async function nextTripIdeaDraft() {
  return prisma.tripIdea.findFirst({ where: { status: "DRAFTING" }, orderBy: { createdAt: "asc" }, select: { id: true } });
}

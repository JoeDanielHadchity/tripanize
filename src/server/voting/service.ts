import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTrip, roleAllows } from "@/server/auth/permissions";
import { AppError, conflictError } from "@/server/errors";
import { recordChange } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";
import { getTripPlan } from "@/server/plans/access";
import type { PollOption, PollView } from "@/lib/voting";

const input = z.object({ question: z.string().trim().min(3).max(160), kind: z.enum(["DESTINATION", "ACTIVITY"]), options: z.array(z.string().trim().min(1).max(160)).min(2).max(8) });
const optionsOf = (value: unknown) => z.array(z.object({ id: z.string(), label: z.string() })).parse(value) as PollOption[];
const validVersion = (v: number) => { if (!Number.isSafeInteger(v) || v < 1) throw new AppError("VALIDATION", "Refresh this vote and try again."); };

export async function listPolls(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId);
  const premium = (await getTripPlan(tripId)).premium;
  const rows = await prisma.tripPoll.findMany({ where: { tripId }, orderBy: { createdAt: "desc" }, take: 100,
    include: { votes: { where: { user: { suspendedAt: null, memberships: { some: { tripId } } } }, select: { userId: true, optionId: true } } },
  });
  const polls: PollView[] = rows.map(p => ({ id: p.id, question: p.question, kind: p.kind, status: p.status, version: p.version,
    options: optionsOf(p.options).map(o => ({ ...o, count: p.votes.filter(v => v.optionId === o.id).length })), myOptionId: p.votes.find(v => v.userId === userId)?.optionId ?? null,
    totalVotes: p.votes.length, chosenOptionId: p.chosenOptionId, decisionNote: p.decisionNote, decidedAt: p.decidedAt?.toISOString() ?? null,
  }));
  const [destinations, stops, events, searches] = await Promise.all([
    prisma.destination.findMany({ where: { tripId }, orderBy: { position: "asc" }, select: { name: true }, take: 20 }),
    prisma.stop.findMany({ where: { tripId, status: { not: "SKIPPED" } }, orderBy: { position: "asc" }, select: { title: true }, take: 40 }),
    premium ? prisma.tripEvent.findMany({ where: { tripId, status: { not: "HIDDEN" }, cancelled: false }, select: { title: true }, take: 40 }) : [],
    roleAllows(access.role, "edit") ? prisma.destinationSearch.findMany({ where: { userId, status: "SUCCEEDED" }, orderBy: { number: "desc" }, select: { result: true }, take: 5 }) : [],
  ]);
  // Only the signed-in creator sees their own saved ideas. A label joins the
  // shared poll only when they explicitly choose it; search preferences stay private.
  const savedIdeas = searches.flatMap(s => {
    const parsed = z.object({ ideas: z.array(z.object({ destination: z.string(), country: z.string() })) }).safeParse(s.result);
    return parsed.success ? parsed.data.ideas.slice(0, 5).map(i => `${i.destination}, ${i.country}`.slice(0, 160)) : [];
  });
  return { polls, canCreate: roleAllows(access.role, "edit"), canDecide: access.role === "OWNER", premium,
    suggestions: { DESTINATION: [...new Set([...destinations.map(d => d.name), ...savedIdeas])], ACTIVITY: [...new Set([...events, ...stops].map(s => s.title))].slice(0, 40) },
  };
}
export async function createPoll(userId: string, tripId: string, raw: z.input<typeof input>) {
  await requireTrip(tripId, userId, "edit");
  const result = input.safeParse(raw);
  if (!result.success) throw new AppError("VALIDATION", "Enter a question and 2–8 choices, each up to 160 characters.");
  const d = result.data;
  if (new Set(d.options.map(o => o.toLocaleLowerCase())).size !== d.options.length) throw new AppError("VALIDATION", "Each choice must be different.");
  await rateLimit(`poll-create:${userId}`, 20, 3600);
  return prisma.$transaction(async tx => {
    if (await tx.tripPoll.count({ where: { tripId } }) >= 100 || await tx.tripPoll.count({ where: { tripId, status: "OPEN" } }) >= 20) throw new AppError("VALIDATION", "Keep up to 20 open votes and 100 votes per trip. Finalize an open vote first.");
    const p = await tx.tripPoll.create({ data: { tripId, question: d.question, kind: d.kind, options: d.options.map(label => ({ id: randomUUID(), label })), createdById: userId } });
    await recordChange(tx, { tripId, actorId: userId, entity: "poll", entityId: p.id, action: "create", after: { question: p.question } });
    return { id: p.id };
  });
}
export async function castVote(userId: string, tripId: string, pollId: string, optionId: string | null, version: number) {
  await requireTrip(tripId, userId); // Viewers may participate without getting editing rights.
  validVersion(version);
  if (typeof pollId !== "string" || pollId.length > 64 || (optionId !== null && (typeof optionId !== "string" || optionId.length > 64))) throw new AppError("VALIDATION", "Choose an option from this vote.");
  await rateLimit(`poll-vote:${userId}`, 120, 3600);
  await prisma.$transaction(async tx => {
    const p = await tx.tripPoll.findFirst({ where: { id: pollId, tripId } });
    if (!p) throw new AppError("NOT_FOUND", "Vote not found.");
    if (p.version !== version) throw conflictError("This vote");
    if (p.status !== "OPEN") throw new AppError("CONFLICT", "This vote is closed. The organizer can reopen it.");
    if (optionId && !optionsOf(p.options).some(o => o.id === optionId)) throw new AppError("VALIDATION", "That choice doesn't belong to this vote.");
    const before = await tx.tripVote.findUnique({ where: { pollId_userId: { pollId, userId } } });
    if ((before?.optionId ?? null) === optionId) return;
    if (optionId) await tx.tripVote.upsert({ where: { pollId_userId: { pollId, userId } }, create: { pollId, userId, optionId }, update: { optionId } });
    else await tx.tripVote.deleteMany({ where: { pollId, userId } });
    await recordChange(tx, { tripId, actorId: userId, entity: "poll", entityId: pollId, action: "vote", after: { optionId } });
  });
}
export async function decidePoll(userId: string, tripId: string, pollId: string, command: "DECIDE" | "REOPEN" | "ARCHIVE", optionId: string | null, note: string | null, version: number) {
  await requireTrip(tripId, userId, "manage");
  validVersion(version);
  if (!["DECIDE", "REOPEN", "ARCHIVE"].includes(command) || (note !== null && (typeof note !== "string" || note.length > 500))) throw new AppError("VALIDATION", "Enter a decision note up to 500 characters.");
  await prisma.$transaction(async tx => {
    const p = await tx.tripPoll.findFirst({ where: { id: pollId, tripId } });
    if (!p) throw new AppError("NOT_FOUND", "Vote not found.");
    if (command === "DECIDE" && (p.status !== "OPEN" || !optionsOf(p.options).some(o => o.id === optionId))) throw new AppError("VALIDATION", "Choose an option from an open vote.");
    if (command === "REOPEN" && p.status === "OPEN") throw conflictError("This vote");
    const changed = await tx.tripPoll.updateMany({ where: { id: pollId, tripId, version }, data: {
      status: command === "DECIDE" ? "DECIDED" : command === "REOPEN" ? "OPEN" : "ARCHIVED", version: { increment: 1 },
      ...(command === "DECIDE" ? { chosenOptionId: optionId, decisionNote: note?.trim() || null, decidedAt: new Date(), decidedById: userId } : command === "REOPEN" ? { chosenOptionId: null, decisionNote: null, decidedAt: null, decidedById: null } : {}),
    } });
    if (!changed.count) throw conflictError("This vote");
    await recordChange(tx, { tripId, actorId: userId, entity: "poll", entityId: pollId, action: command === "DECIDE" ? "decide" : command === "REOPEN" ? "reopen" : "archive", after: { optionId: command === "DECIDE" ? optionId : null } });
  });
}

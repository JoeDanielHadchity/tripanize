import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { LOCATION_TTL_MS, type LocationSelf, type MemberLocations } from "@/lib/member-locations";

const token = z.string().regex(/^[a-zA-Z0-9_-]{32,128}$/);
const position = z.object({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180), accuracy: z.number().finite().min(0).max(100_000), capturedAt: z.iso.datetime() });
export const locationCommand = z.discriminatedUnion("op", [
  position.extend({ op: z.literal("start"), token, scope: z.string().min(1).max(64), expectedVersion: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict(),
  position.extend({ op: z.literal("update"), token }).strict(),
  z.object({ op: z.literal("stop"), token: token.optional() }).strict(),
]);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const cleared = { sessionId: null, leaseHash: null, lat: null, lng: null, accuracy: null, capturedAt: null, updatedAt: null, expiresAt: null };

/** No audit log, revision bump, email, offline snapshot, or export contains GPS points. */
export async function expireMemberLocations() {
  await prisma.memberLocation.updateMany({ where: { expiresAt: { lte: new Date() } }, data: { ...cleared, version: { increment: 1 } } });
}

function self(row: { version: number; sessionId: string | null; expiresAt: Date | null } | null, scope: string): LocationSelf {
  return { scope, version: row?.version ?? 0, sessionId: row?.expiresAt && row.expiresAt.getTime() > Date.now() ? row.sessionId : null, expiresAt: row?.expiresAt?.toISOString() ?? null };
}

export async function getLocationSelf(userId: string, tripId: string): Promise<LocationSelf> {
  await requireTrip(tripId, userId, "view");
  await expireMemberLocations();
  const member = await prisma.tripMembership.findUniqueOrThrow({ where: { tripId_userId: { tripId, userId } } });
  return self(await prisma.memberLocation.findUnique({ where: { membershipId: member.id }, select: { version: true, sessionId: true, expiresAt: true } }), member.id);
}

export async function getMemberLocations(userId: string, tripId: string): Promise<MemberLocations> {
  await requireTrip(tripId, userId, "view");
  await expireMemberLocations();
  const members = await prisma.tripMembership.findMany({ where: { tripId }, include: { user: { select: { name: true } }, location: true }, orderBy: { createdAt: "asc" } });
  return {
    members: members.map(m => ({ userId: m.userId, name: m.user.name })),
    self: self(members.find(m => m.userId === userId)?.location ?? null, members.find(m => m.userId === userId)!.id),
    locations: members.flatMap(m => {
      const p = m.location;
      return p?.sessionId && p.expiresAt && p.expiresAt.getTime() > Date.now() && p.lat !== null && p.lng !== null && p.accuracy !== null && p.updatedAt
        ? [{ userId: m.userId, name: m.user.name, lat: p.lat, lng: p.lng, accuracy: p.accuracy, updatedAt: p.updatedAt.toISOString(), expiresAt: p.expiresAt.toISOString() }] : [];
    }),
  };
}

export async function changeMemberLocation(userId: string, tripId: string, input: unknown): Promise<LocationSelf> {
  await requireTrip(tripId, userId, "view");
  const parsed = locationCommand.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Invalid location sharing request.");
  const command = parsed.data;
  const now = new Date();
  if (command.op !== "stop") {
    const age = now.getTime() - new Date(command.capturedAt).getTime();
    if (age > 90_000 || age < -15_000) throw new AppError("VALIDATION", "That location is out of date. Please get a fresh location and try again.");
  }
  await expireMemberLocations();
  const result = await prisma.$transaction(async tx => {
    const member = await tx.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId } } });
    if (!member) throw new AppError("NOT_FOUND", "Trip not found.");
    if (command.op === "stop") {
      const previous = await tx.memberLocation.upsert({ where: { membershipId: member.id }, create: { membershipId: member.id }, update: {} });
      // A departed tab may cancel only its own lease. Bumping the version also
      // invalidates an in-flight start without stopping a newer device's lease.
      const clear = !command.token || previous.leaseHash === hash(command.token);
      return tx.memberLocation.update({ where: { membershipId: member.id }, data: { ...(clear ? cleared : {}), version: { increment: 1 } } });
    }
    const data = { lat: command.lat, lng: command.lng, accuracy: command.accuracy, capturedAt: new Date(command.capturedAt), updatedAt: now, expiresAt: new Date(now.getTime() + LOCATION_TTL_MS) };
    if (command.op === "start") {
      if (command.scope !== member.id) throw new AppError("CONFLICT", "Trip membership changed. Turn location sharing on again to resume.");
      await tx.memberLocation.upsert({ where: { membershipId: member.id }, create: { membershipId: member.id }, update: {} });
      const changed = await tx.memberLocation.updateMany({ where: { membershipId: member.id, version: command.expectedVersion }, data: { ...data, sessionId: randomUUID(), leaseHash: hash(command.token), version: { increment: 1 } } });
      if (!changed.count) throw new AppError("CONFLICT", "Your sharing setting changed on another tab or device. Please try again.");
    } else {
      const changed = await tx.memberLocation.updateMany({ where: { membershipId: member.id, leaseHash: hash(command.token), expiresAt: { gt: now }, capturedAt: { lt: new Date(command.capturedAt) } }, data });
      if (!changed.count) {
        // Browsers may return the same cached fix on a quick refresh. Accept it
        // without extending the point's lifetime or claiming a new observation.
        const duplicate = await tx.memberLocation.findFirst({ where: { membershipId: member.id, leaseHash: hash(command.token), expiresAt: { gt: now }, capturedAt: new Date(command.capturedAt) } });
        if (duplicate) return duplicate;
        throw new AppError("CONFLICT", "Sharing stopped, expired or moved to another device. Turn it on again to resume.");
      }
    }
    return tx.memberLocation.findUniqueOrThrow({ where: { membershipId: member.id } });
  });
  if (result.expiresAt) await currentRuntime().wakeLocationExpiry?.(result.expiresAt.getTime());
  return self(result, result.membershipId);
}

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";
import { sendEmail } from "@/server/notifications/email";
import type { TripRole } from "@/generated/prisma/enums";

export const INVITE_TTL_DAYS = 7;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates an invitation. The secret token (256 bits) is returned once and only its hash is stored.
 * If `email` is given the invitation can only be accepted by an account with that email address.
 */
export async function createInvitation(
  userId: string,
  tripId: string,
  input: { role: "COLLABORATOR" | "VIEWER"; email?: string | null; travelerId?: string | null },
) {
  await requireTrip(tripId, userId, "manage");
  await rateLimit(`invite:${userId}`, 30, 3600, "Too many invitations in the last hour. Please wait a bit.");
  if (input.role !== "COLLABORATOR" && input.role !== "VIEWER") throw new AppError("VALIDATION", "Choose collaborator or viewer.");
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("VALIDATION", "Enter a valid email address.");
  if (input.travelerId) {
    const t = await prisma.traveler.findFirst({ where: { id: input.travelerId, tripId } });
    if (!t) throw new AppError("VALIDATION", "Traveler not found on this trip.");
    if (t.userId) throw new AppError("VALIDATION", `${t.name} is already connected to an account.`);
  }
  const token = randomBytes(32).toString("base64url");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const inv = await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: { tripId, tokenHash: hashToken(token), email, role: input.role, travelerId: input.travelerId || null, createdById: userId, expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400_000) },
    });
    await recordChange(tx, { tripId, actorId: userId, entity: "invitation", entityId: inv.id, action: "create", after: { role: input.role, email } });
    return inv;
  });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`;
  let emailStatus: string | null = null;
  if (email) {
    const res = await sendEmail({
      to: email,
      subject: `${inviter.name} invited you to “${trip.name}” on Tripanize`,
      text: `${inviter.name} invited you to join the trip “${trip.name}” as a ${input.role === "COLLABORATOR" ? "collaborator (can edit)" : "viewer (read-only)"}.\n\nOpen this link to join:\n${url}\n\nOr go to ${process.env.APP_URL ?? "Tripanize"} and sign in with this email address (${email}) — we'll email you a sign-in code, no password needed. The invitation will be waiting on your trips page.\n\nThe invitation expires in ${INVITE_TTL_DAYS} days.`,
    });
    emailStatus = res.status === "failed" ? `failed: ${res.error}` : res.status;
    await prisma.invitation.update({ where: { id: inv.id }, data: { emailStatus } });
  }
  return { id: inv.id, url, emailStatus, expiresAt: inv.expiresAt };
}

export async function revokeInvitation(userId: string, tripId: string, invitationId: string) {
  await requireTrip(tripId, userId, "manage");
  await prisma.$transaction(async tx => {
    const res = await tx.invitation.updateMany({ where: { id: invitationId, tripId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!res.count) throw new AppError("NOT_FOUND", "Invitation not found or already used.");
    await recordChange(tx, { tripId, actorId: userId, entity: "invitation", entityId: invitationId, action: "revoke" });
  });
}

export type InvitationPreview =
  | { ok: true; tripName: string; inviterName: string; role: TripRole; email: string | null; travelerName: string | null; expiresAt: Date }
  | { ok: false; reason: string };

/** Minimal, non-sensitive information shown before accepting (trip name and inviter only). */
export async function previewInvitation(token: string): Promise<InvitationPreview> {
  if (!token || token.length > 100) return { ok: false, reason: "This invitation link is not valid." };
  const inv = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) }, include: { trip: { select: { name: true } }, traveler: { select: { name: true } } } });
  if (!inv) return { ok: false, reason: "This invitation link is not valid." };
  if (inv.revokedAt) return { ok: false, reason: "This invitation was revoked by the trip owner." };
  if (inv.acceptedAt) return { ok: false, reason: "This invitation has already been used." };
  if (inv.expiresAt < new Date()) return { ok: false, reason: "This invitation has expired. Ask the trip owner for a new link." };
  const inviter = await prisma.user.findUnique({ where: { id: inv.createdById }, select: { name: true } });
  return { ok: true, tripName: inv.trip.name, inviterName: inviter?.name ?? "A traveler", role: inv.role, email: inv.email, travelerName: inv.traveler?.name ?? null, expiresAt: inv.expiresAt };
}

/**
 * Accepts an invitation for the signed-in account. Single use: the invitation is claimed atomically so two
 * accounts can't both accept it. An existing planned traveler is linked to the account (keeping their expense
 * history); a returning traveler is re-linked to their previous identity; otherwise a new traveler is created.
 */
export async function acceptInvitation(userId: string, token: string) {
  return acceptWhere(userId, { tokenHash: hashToken(token) });
}

/** Invitations addressed to this account's email that are still open, shown on the home screen. */
export async function listPendingInvitations(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const invs = await prisma.invitation.findMany({
    where: { email: user.email.toLowerCase(), acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() }, trip: { memberships: { none: { userId } } } },
    include: { trip: { select: { name: true, startDate: true, endDate: true } } },
    orderBy: { createdAt: "desc" },
  });
  const senders = await prisma.user.findMany({ where: { id: { in: invs.map((i) => i.createdById) } }, select: { id: true, name: true, email: true } });
  const from = (id: string) => { const u = senders.find((x) => x.id === id); return u ? u.name || u.email.split("@")[0] : "Someone"; };
  return invs.map((i) => ({ id: i.id, tripName: i.trip.name, startDate: i.trip.startDate, endDate: i.trip.endDate, role: i.role, from: from(i.createdById) }));
}

/** Accept an email-addressed invitation from the home screen (no link needed: the signed-in email proves it). */
export async function acceptInvitationById(userId: string, invitationId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const inv = await prisma.invitation.findUnique({ where: { id: invitationId } });
  if (!inv?.email || inv.email !== user.email.toLowerCase()) throw new AppError("NOT_FOUND", "This invitation is not valid.");
  return acceptWhere(userId, { id: invitationId });
}

export async function declineInvitation(userId: string, invitationId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const res = await prisma.invitation.updateMany({ where: { id: invitationId, email: user.email.toLowerCase(), acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!res.count) throw new AppError("NOT_FOUND", "Invitation not found or already used.");
}

async function acceptWhere(userId: string, where: { tokenHash: string } | { id: string }) {
  await rateLimit(`accept:${userId}`, 20, 3600);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where });
    if (!inv || inv.revokedAt) throw new AppError("NOT_FOUND", "This invitation is not valid or was revoked.");
    if (inv.acceptedAt) throw new AppError("CONFLICT", "This invitation has already been used.");
    if (inv.expiresAt < new Date()) throw new AppError("VALIDATION", "This invitation has expired. Ask the trip owner for a new link.");
    if (inv.email && inv.email !== user.email.toLowerCase()) {
      throw new AppError("FORBIDDEN", `This invitation was sent to ${maskEmail(inv.email)}. Sign in with that account to accept it.`);
    }
    const existing = await tx.tripMembership.findUnique({ where: { tripId_userId: { tripId: inv.tripId, userId } } });
    if (existing) throw new AppError("CONFLICT", "You're already a member of this trip.");

    const claimed = await tx.invitation.updateMany({ where: { id: inv.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: new Date(), acceptedById: userId } });
    if (!claimed.count) throw new AppError("CONFLICT", "This invitation has already been used.");

    let travelerId: string;
    const previous = await tx.traveler.findUnique({ where: { tripId_userId: { tripId: inv.tripId, userId } } });
    if (previous) {
      travelerId = previous.id;
      await tx.traveler.update({ where: { id: previous.id }, data: { leftAt: null } });
    } else if (inv.travelerId) {
      const planned = await tx.traveler.findUnique({ where: { id: inv.travelerId } });
      if (!planned || planned.userId) throw new AppError("CONFLICT", "The traveler this invitation was meant for is already connected to another account.");
      await tx.traveler.update({ where: { id: planned.id }, data: { userId, leftAt: null } });
      travelerId = planned.id;
    } else {
      const t = await tx.traveler.create({ data: { tripId: inv.tripId, name: user.name, userId } });
      travelerId = t.id;
    }
    await tx.tripMembership.create({ data: { tripId: inv.tripId, userId, role: inv.role, travelerId } });
    await tx.notificationPreference.upsert({
      where: { userId_tripId: { userId, tripId: inv.tripId } },
      create: { userId, tripId: inv.tripId, emailEnabled: false, changeTypes: ["date", "venue", "cancelled", "sold_out"] },
      update: {},
    });
    await recordChange(tx, { tripId: inv.tripId, actorId: userId, entity: "membership", entityId: userId, action: "join", after: { role: inv.role } });
    return { tripId: inv.tripId };
  });
}

function maskEmail(e: string) {
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}

/** Removes a member (or the member themself leaving). Their traveler identity and expense history remain. */
export async function removeMember(actorId: string, tripId: string, memberUserId: string) {
  const self = actorId === memberUserId;
  const access = await requireTrip(tripId, actorId, self ? "view" : "manage");
  const m = await prisma.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId: memberUserId } } });
  if (!m) throw new AppError("NOT_FOUND", "Member not found.");
  if (m.role === "OWNER") throw new AppError("VALIDATION", self ? "The owner can't leave their own trip. Transfer ownership first, or delete the trip." : "The owner can't be removed.");
  void access;
  await prisma.$transaction(async (tx) => {
    await tx.tripMembership.delete({ where: { id: m.id } });
    if (m.travelerId) await tx.traveler.update({ where: { id: m.travelerId }, data: { leftAt: new Date() } });
    // Personal packing list is private to the member and goes with them.
    await tx.packingItem.deleteMany({ where: { tripId, ownerId: memberUserId } });
    await tx.notificationPreference.deleteMany({ where: { tripId, userId: memberUserId } });
    await tx.tripNotification.deleteMany({ where: { tripId, userId: memberUserId } });
    await recordChange(tx, { tripId, actorId, entity: "membership", entityId: memberUserId, action: self ? "leave" : "remove" });
  });
}

export async function changeRole(actorId: string, tripId: string, memberUserId: string, role: "COLLABORATOR" | "VIEWER") {
  await requireTrip(tripId, actorId, "manage");
  if (role !== "COLLABORATOR" && role !== "VIEWER") throw new AppError("VALIDATION", "Invalid role.");
  const m = await prisma.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId: memberUserId } } });
  if (!m) throw new AppError("NOT_FOUND", "Member not found.");
  if (m.role === "OWNER") throw new AppError("VALIDATION", "Use “Transfer ownership” to change the owner.");
  await prisma.$transaction(async (tx) => {
    await tx.tripMembership.update({ where: { id: m.id }, data: { role } });
    await recordChange(tx, { tripId, actorId, entity: "membership", entityId: memberUserId, action: "role", after: { role } });
  });
}

export async function transferOwnership(actorId: string, tripId: string, newOwnerUserId: string) {
  await requireTrip(tripId, actorId, "manage");
  const target = await prisma.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId: newOwnerUserId } } });
  if (!target || target.role === "OWNER") throw new AppError("VALIDATION", "Choose another member of this trip.");
  await prisma.$transaction(async (tx) => {
    await tx.tripMembership.update({ where: { tripId_userId: { tripId, userId: actorId } }, data: { role: "COLLABORATOR" } });
    await tx.tripMembership.update({ where: { id: target.id }, data: { role: "OWNER" } });
    await tx.trip.update({ where: { id: tripId }, data: { ownerId: newOwnerUserId } });
    await recordChange(tx, { tripId, actorId, entity: "membership", entityId: newOwnerUserId, action: "transfer_owner" });
  });
}

export async function addTraveler(actorId: string, tripId: string, name: string, isChild = false) {
  await requireTrip(tripId, actorId, "edit");
  const n = name.trim().slice(0, 80);
  if (!n) throw new AppError("VALIDATION", "Enter a name.");
  const dup = (await prisma.traveler.findMany({ where: { tripId, leftAt: null } })).find((t) => t.name.toLocaleLowerCase() === n.toLocaleLowerCase());
  if (dup) throw new AppError("VALIDATION", `${dup.name} is already on this trip.`);
  return prisma.$transaction(async (tx) => {
    const t = await tx.traveler.create({ data: { tripId, name: n, isChild } });
    await recordChange(tx, { tripId, actorId, entity: "traveler", entityId: t.id, action: "create", after: { name: n } });
    return t;
  });
}

export async function renameTraveler(actorId: string, tripId: string, travelerId: string, name: string) {
  await requireTrip(tripId, actorId, "edit");
  const n = name.trim().slice(0, 80);
  if (!n) throw new AppError("VALIDATION", "Enter a name.");
  await prisma.$transaction(async tx => {
    const res = await tx.traveler.updateMany({ where: { id: travelerId, tripId }, data: { name: n } });
    if (!res.count) throw new AppError("NOT_FOUND", "Traveler not found.");
    await recordChange(tx, { tripId, actorId, entity: "traveler", entityId: travelerId, action: "update" });
  });
}

/** Planned travelers with no account and no history can be removed; others are kept for the ledger. */
export async function removePlannedTraveler(actorId: string, tripId: string, travelerId: string) {
  await requireTrip(tripId, actorId, "edit");
  const t = await prisma.traveler.findFirst({ where: { id: travelerId, tripId }, include: { _count: { select: { shares: true, paidExpenses: true, sentSettlements: true, receivedSettlements: true } } } });
  if (!t) throw new AppError("NOT_FOUND", "Traveler not found.");
  if (t.userId) throw new AppError("VALIDATION", "This traveler has an account. Remove their access from the members list instead.");
  const history = t._count.shares + t._count.paidExpenses + t._count.sentSettlements + t._count.receivedSettlements;
  await prisma.$transaction(async (tx) => {
    if (history) await tx.traveler.update({ where: { id: t.id }, data: { leftAt: new Date() } });
    else await tx.traveler.delete({ where: { id: t.id } });
    await recordChange(tx, { tripId, actorId, entity: "traveler", entityId: t.id, action: history ? "archive" : "delete" });
  });
  return { archived: history > 0 };
}

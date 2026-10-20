import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import type { TripRole } from "@/generated/prisma/enums";

/**
 * Trip permission model (enforced server-side on every operation):
 *  - view:    owner, collaborator, viewer — read shared trip information.
 *  - edit:    owner, collaborator — change itinerary, bookings, expenses, events, tasks, shared packing list, trip details.
 *  - manage:  owner — invitations, roles, removing members, deleting the trip.
 * Personal packing lists are a separate permission: only the list's owner may read or change it,
 * regardless of trip role (a viewer still controls their own list).
 */
export type Capability = "view" | "edit" | "manage";

const CAPS: Record<TripRole, Capability[]> = {
  OWNER: ["view", "edit", "manage"],
  COLLABORATOR: ["view", "edit"],
  VIEWER: ["view"],
};

export function roleAllows(role: TripRole, cap: Capability) {
  return CAPS[role].includes(cap);
}

export type TripAccess = { tripId: string; userId: string; role: TripRole; travelerId: string | null };

export async function getTripAccess(tripId: string, userId: string): Promise<TripAccess | null> {
  const m = await prisma.tripMembership.findUnique({ where: { tripId_userId: { tripId, userId } } });
  if (!m) return null;
  return { tripId, userId, role: m.role, travelerId: m.travelerId };
}

/** Throws NOT_FOUND for non-members so trip existence is not leaked. */
export async function requireTrip(tripId: string, userId: string, cap: Capability = "view"): Promise<TripAccess> {
  if (typeof tripId !== "string" || tripId.length > 64) throw new AppError("NOT_FOUND", "Trip not found.");
  const access = await getTripAccess(tripId, userId);
  if (!access) throw new AppError("NOT_FOUND", "Trip not found.");
  if (!roleAllows(access.role, cap)) {
    throw new AppError(
      "FORBIDDEN",
      cap === "manage" ? "Only the trip owner can do this." : "You have view-only access to this trip.",
    );
  }
  return access;
}

export function canEditPackingItem(item: { ownerId: string | null }, access: TripAccess) {
  if (item.ownerId === null) return roleAllows(access.role, "edit");
  return item.ownerId === access.userId;
}

export function canViewPackingItem(item: { ownerId: string | null }, access: TripAccess) {
  return item.ownerId === null || item.ownerId === access.userId;
}

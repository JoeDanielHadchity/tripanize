"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import * as inv from "@/server/invitations/service";

const rv = (tripId: string) => revalidatePath(`/trips/${tripId}`, "layout");

export async function createInviteAction(tripId: string, input: { role: "COLLABORATOR" | "VIEWER"; email?: string | null; travelerId?: string | null }) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await inv.createInvitation(u.id, tripId, input);
    rv(tripId);
    return r;
  });
}

export async function revokeInviteAction(tripId: string, invitationId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await inv.revokeInvitation(u.id, tripId, invitationId);
    rv(tripId);
  });
}

export async function acceptInviteAction(token: string) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await inv.acceptInvitation(u.id, token);
    revalidatePath("/trips");
    return r;
  });
}

export async function acceptInviteByIdAction(invitationId: string) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await inv.acceptInvitationById(u.id, invitationId);
    revalidatePath("/trips");
    return r;
  });
}

export async function declineInviteAction(invitationId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await inv.declineInvitation(u.id, invitationId);
    revalidatePath("/trips");
  });
}

export async function removeMemberAction(tripId: string, userId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await inv.removeMember(u.id, tripId, userId);
    revalidatePath("/trips");
    if (u.id !== userId) rv(tripId);
  });
}

export async function changeRoleAction(tripId: string, userId: string, role: "COLLABORATOR" | "VIEWER") {
  return runAction(async () => {
    const u = await requireUser();
    await inv.changeRole(u.id, tripId, userId, role);
    rv(tripId);
  });
}

export async function transferOwnerAction(tripId: string, userId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await inv.transferOwnership(u.id, tripId, userId);
    rv(tripId);
  });
}

export async function addTravelerAction(tripId: string, name: string, isChild: boolean) {
  return runAction(async () => {
    const u = await requireUser();
    await inv.addTraveler(u.id, tripId, name, isChild);
    rv(tripId);
  });
}

export async function renameTravelerAction(tripId: string, travelerId: string, name: string) {
  return runAction(async () => {
    const u = await requireUser();
    await inv.renameTraveler(u.id, tripId, travelerId, name);
    rv(tripId);
  });
}

export async function removeTravelerAction(tripId: string, travelerId: string) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await inv.removePlannedTraveler(u.id, tripId, travelerId);
    rv(tripId);
    return r;
  });
}

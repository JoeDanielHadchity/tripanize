"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { addPackingItem, refreshSuggestions, removePackingItem, updatePackingItem } from "@/server/packing/service";

const rv = (tripId: string) => revalidatePath(`/trips/${tripId}/packing`);

export async function refreshPackingAction(tripId: string, laundry: boolean | null) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await refreshSuggestions(u.id, tripId, { laundry });
    rv(tripId);
    return r;
  });
}

export async function addPackingAction(tripId: string, input: { label: string; category: string; quantity?: number; shared: boolean }) {
  return runAction(async () => {
    const u = await requireUser();
    await addPackingItem(u.id, tripId, input);
    rv(tripId);
  });
}

export async function updatePackingAction(tripId: string, itemId: string, patch: { label?: string; category?: string; quantity?: number; packed?: boolean }, version: number) {
  return runAction(async () => {
    const u = await requireUser();
    await updatePackingItem(u.id, tripId, itemId, patch, version);
    rv(tripId);
  });
}

export async function removePackingAction(tripId: string, itemId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await removePackingItem(u.id, tripId, itemId);
    rv(tripId);
  });
}

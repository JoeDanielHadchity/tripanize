"use server";
import { requireUser } from "@/server/auth/session";
import { revalidatePath } from "next/cache";
import { runAction } from "@/server/errors";
import { chooseDestination, createDestinationDraft, deleteDestinationSearch, getDestinationSearch, getDestinationWorkspace, saveDestinationDraft, startDestinationSearch } from "@/server/destinations/service";
export async function findDestinationsAction(input: unknown, searchId?: string) { return runAction(async () => { const user = await requireUser(); const queued = await startDestinationSearch(user.id, input, searchId); return (await getDestinationSearch(user.id, queued.id))!; }); }
export async function createDestinationDraftAction(copyFromId?: string) { return runAction(async () => createDestinationDraft((await requireUser()).id, copyFromId)); }
export async function saveDestinationDraftAction(id: string, input: unknown) { return runAction(async () => saveDestinationDraft((await requireUser()).id, id, input)); }
export async function loadDestinationSearchAction(id: string) { return runAction(async () => (await getDestinationSearch((await requireUser()).id, id))!); }
export async function chooseDestinationAction(id: string, index: number) { return runAction(async () => chooseDestination((await requireUser()).id, id, index)); }
export async function deleteDestinationSearchAction(id: string) { return runAction(async () => { const user = await requireUser(); await deleteDestinationSearch(user.id, id); revalidatePath("/destinations"); return getDestinationWorkspace(user.id); }); }

"use server";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { chooseDestination, startDestinationSearch } from "@/server/destinations/service";
export async function findDestinationsAction(input: unknown) { return runAction(async () => startDestinationSearch((await requireUser()).id, input)); }
export async function chooseDestinationAction(id: string, index: number) { return runAction(async () => chooseDestination((await requireUser()).id, id, index)); }

"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { castVote, createPoll, decidePoll } from "@/server/voting/service";
const refresh = (id: string) => revalidatePath(`/trips/${id}`, "layout");
export async function createPollAction(tripId: string, input: { question: string; kind: "DESTINATION" | "ACTIVITY"; options: string[] }) {
  return runAction(async () => { const u = await requireUser(); const p = await createPoll(u.id, tripId, input); refresh(tripId); return p; });
}
export async function castVoteAction(tripId: string, pollId: string, optionId: string | null, version: number) {
  return runAction(async () => { const u = await requireUser(); await castVote(u.id, tripId, pollId, optionId, version); refresh(tripId); });
}
export async function decidePollAction(tripId: string, pollId: string, command: "DECIDE" | "REOPEN" | "ARCHIVE", optionId: string | null, note: string | null, version: number) {
  return runAction(async () => { const u = await requireUser(); await decidePoll(u.id, tripId, pollId, command, optionId, note, version); refresh(tripId); });
}

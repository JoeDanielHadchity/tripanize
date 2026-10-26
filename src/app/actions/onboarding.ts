"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { chooseNormal, createTripDraft, retryOnboarding, saveOnboardingDetails, startOnboardingPlan } from "@/server/trips/onboarding";
import type { TripInput } from "@/server/trips/schemas";

export async function createDraftAction(name: string, trialInvitationId?: string) { return runAction(async () => { const result = await createTripDraft((await requireUser()).id, name, trialInvitationId); revalidatePath("/trips", "layout"); revalidatePath("/start"); return result; }); }
export async function chooseNormalAction(tripId: string) { return runAction(async () => { const r = await chooseNormal((await requireUser()).id, tripId); revalidatePath(`/trips/${tripId}`, "layout"); return r; }); }
export async function onboardingDetailsAction(tripId: string, input: TripInput, version: number) { return runAction(async () => { await saveOnboardingDetails((await requireUser()).id, tripId, input, version); revalidatePath(`/trips/${tripId}`, "layout"); }); }
export async function onboardingAnswersAction(tripId: string, input: { answers: { q: string; a: string[] }[]; note: string | null; foodNotes?: string | null }) { return runAction(async () => { const r = await startOnboardingPlan((await requireUser()).id, tripId, input); revalidatePath(`/trips/${tripId}`, "layout"); return r; }); }
export async function retryOnboardingAction(tripId: string) { return runAction(async () => { await retryOnboarding((await requireUser()).id, tripId); }); }

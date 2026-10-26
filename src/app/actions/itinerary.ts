"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import * as it from "@/server/itinerary/service";
import { enqueueJob, cancelJob, type JobKind } from "@/server/planner/jobs";
import { applyProposal } from "@/server/planner/apply";
import { getPlanQuestions, savePlanPrefs } from "@/server/planner/questions";

const rv = (tripId: string) => revalidatePath(`/trips/${tripId}`, "layout");

export async function addStopAction(tripId: string, dayId: string | null, plan: "A" | "B", input: it.StopInput) {
  return runAction(async () => {
    const u = await requireUser();
    await it.addStop(u.id, tripId, { dayId, plan, input });
    rv(tripId);
  });
}

export async function updateStopAction(tripId: string, stopId: string, input: Partial<it.StopInput>, version: number, confirm: boolean, dryRun = false) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await it.updateStop(u.id, tripId, stopId, input, { version, confirm, dryRun });
    if (!dryRun) rv(tripId);
    return r;
  });
}

export async function setStopStatusAction(tripId: string, stopId: string, status: "SUGGESTED" | "PLANNED" | "SKIPPED", version: number) {
  return runAction(async () => {
    const u = await requireUser();
    await it.setStopStatus(u.id, tripId, stopId, status, version);
    rv(tripId);
  });
}

export async function deleteStopAction(tripId: string, stopId: string, confirm: boolean) {
  return runAction(async () => {
    const u = await requireUser();
    await it.deleteStop(u.id, tripId, stopId, { confirm });
    rv(tripId);
  });
}

export async function reorderAction(tripId: string, dayId: string, plan: string, ids: string[], dryRun: boolean) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await it.reorderStops(u.id, tripId, dayId, plan, ids, { dryRun });
    if (!dryRun) rv(tripId);
    return r;
  });
}

export async function moveStopAction(tripId: string, stopId: string, dayId: string | null, plan: "A" | "B", version: number, confirm: boolean, dryRun: boolean) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await it.moveStop(u.id, tripId, stopId, { dayId, plan }, { version, confirm, dryRun });
    if (!dryRun) rv(tripId);
    return r;
  });
}

export async function replaceStopAction(tripId: string, stopId: string, input: it.StopInput, version: number, dryRun: boolean, origin: "AI" | "MANUAL") {
  return runAction(async () => {
    const u = await requireUser();
    const r = await it.replaceStop(u.id, tripId, stopId, input, { version, dryRun, origin });
    if (!dryRun) rv(tripId);
    return r;
  });
}

export async function setActivePlanAction(tripId: string, dayId: string, plan: "A" | "B") {
  return runAction(async () => {
    const u = await requireUser();
    await it.setActivePlan(u.id, tripId, dayId, plan);
    rv(tripId);
  });
}

export async function updateDayAction(tripId: string, dayId: string, patch: { title?: string | null; notes?: string | null; planBNote?: string | null }, version: number) {
  return runAction(async () => {
    const u = await requireUser();
    await it.updateDay(u.id, tripId, dayId, patch, version);
    rv(tripId);
  });
}

export async function restoreVersionAction(tripId: string, versionId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await it.restoreVersion(u.id, tripId, versionId);
    rv(tripId);
  });
}

export async function startPlanAction(tripId: string, kind: JobKind, params: { dates?: string[]; stopId?: string; instruction?: string | null }) {
  return runAction(async () => {
    const u = await requireUser();
    return enqueueJob(u.id, tripId, kind, params);
  });
}

export async function cancelPlanAction(tripId: string, jobId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await cancelJob(u.id, tripId, jobId);
  });
}

export async function applyPlanAction(tripId: string, jobId: string, dates: string[]) {
  return runAction(async () => {
    const u = await requireUser();
    const r = await applyProposal(u.id, tripId, jobId, dates);
    rv(tripId);
    return r;
  });
}

export async function planQuestionsAction(tripId: string, refresh = false, poll = false, cachedOnly = false) {
  return runAction(async () => {
    const u = await requireUser();
    return getPlanQuestions(u.id, tripId, { refresh, poll, cachedOnly });
  });
}

export async function savePlanPrefsAction(tripId: string, input: { answers: { q: string; a: string[] }[]; note: string | null; foodNotes?: string | null } | null) {
  return runAction(async () => {
    const u = await requireUser();
    await savePlanPrefs(u.id, tripId, input);
    rv(tripId);
  });
}

import { prisma } from "@/server/db";
import { AppError, conflictError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";
import { isDateStr } from "@/lib/dates";

// Trip-wide preparation checklist (shared tasks).
export async function addTask(userId: string, tripId: string, input: { title: string; dueDate?: string | null; assigneeId?: string | null }) {
  await requireTrip(tripId, userId, "edit");
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new AppError("VALIDATION", "Enter a task.");
  if (input.dueDate && !isDateStr(input.dueDate)) throw new AppError("VALIDATION", "Invalid due date.");
  if (input.assigneeId && !(await prisma.traveler.findFirst({ where: { id: input.assigneeId, tripId } }))) throw new AppError("VALIDATION", "Assignee not on this trip.");
  const count = await prisma.tripTask.count({ where: { tripId } });
  return prisma.$transaction(async (tx) => {
    const t = await tx.tripTask.create({ data: { tripId, title, dueDate: input.dueDate || null, assigneeId: input.assigneeId || null, position: count } });
    await recordChange(tx, { tripId, actorId: userId, entity: "task", entityId: t.id, action: "create" });
    return t;
  });
}

export async function toggleTask(userId: string, tripId: string, taskId: string, done: boolean, version: number) {
  await requireTrip(tripId, userId, "edit");
  await prisma.$transaction(async (tx) => {
    const res = await tx.tripTask.updateMany({ where: { id: taskId, tripId, version }, data: { done, version: { increment: 1 } } });
    if (!res.count) throw conflictError("This task");
    await recordChange(tx, { tripId, actorId: userId, entity: "task", entityId: taskId, action: done ? "done" : "undone" });
  });
}

export async function deleteTask(userId: string, tripId: string, taskId: string) {
  await requireTrip(tripId, userId, "edit");
  await prisma.$transaction(async (tx) => {
    const res = await tx.tripTask.deleteMany({ where: { id: taskId, tripId } });
    if (!res.count) throw new AppError("NOT_FOUND", "Task not found.");
    await recordChange(tx, { tripId, actorId: userId, entity: "task", entityId: taskId, action: "delete" });
  });
}

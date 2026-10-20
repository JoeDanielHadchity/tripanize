"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { runAction } from "@/server/errors";
import { createExpense, deleteExpense, deleteSettlement, recordSettlement, updateExpense, type ExpenseInput } from "@/server/expenses/service";

const rv = (tripId: string) => revalidatePath(`/trips/${tripId}`, "layout");

export async function saveExpenseAction(tripId: string, expenseId: string | null, input: ExpenseInput, version: number) {
  return runAction(async () => {
    const u = await requireUser();
    if (expenseId) await updateExpense(u.id, tripId, expenseId, input, version);
    else await createExpense(u.id, tripId, input);
    rv(tripId);
  });
}

export async function deleteExpenseAction(tripId: string, expenseId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await deleteExpense(u.id, tripId, expenseId);
    rv(tripId);
  });
}

export async function recordSettlementAction(tripId: string, input: { fromId: string; toId: string; amount: string; currency: string; paidAt: string; note?: string | null }) {
  return runAction(async () => {
    const u = await requireUser();
    await recordSettlement(u.id, tripId, input);
    rv(tripId);
  });
}

export async function deleteSettlementAction(tripId: string, settlementId: string) {
  return runAction(async () => {
    const u = await requireUser();
    await deleteSettlement(u.id, tripId, settlementId);
    rv(tripId);
  });
}

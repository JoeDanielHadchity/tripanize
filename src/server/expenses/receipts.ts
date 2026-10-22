import { requirePremiumTrip } from "@/server/plans/access";
import { AppError } from "@/server/errors";
import { MAX_ATTACHMENT_BYTES, cleanupPrivateFiles, uploadPrivateFile, type UploadedFile } from "@/server/storage";
import { createExpense, updateExpense, type ExpenseInput } from "./service";

export async function saveExpenseWithReceipts(userId: string, tripId: string, expenseId: string | null, input: ExpenseInput, version: number, files: File[], removeIds: string[]) {
  await requirePremiumTrip(tripId, userId, "expenses", "edit");
  if (files.length > 5 || removeIds.length > 5 || (!expenseId && removeIds.length)) throw new AppError("VALIDATION", "Keep up to 5 receipts per payment.");
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHMENT_BYTES) throw new AppError("VALIDATION", "Attach up to 10 MB of new receipts at a time.");
  const uploads: UploadedFile[] = [];
  try {
    for (const file of files) uploads.push(await uploadPrivateFile(tripId, file));
    if (expenseId) {
      const removed = await updateExpense(userId, tripId, expenseId, input, version, { add: uploads, removeIds });
      await cleanupPrivateFiles(removed);
      return { id: expenseId };
    }
    const expense = await createExpense(userId, tripId, input, { add: uploads, removeIds });
    return { id: expense.id };
  } catch (error) {
    await cleanupPrivateFiles(uploads.map(file => file.storageKey));
    throw error;
  }
}

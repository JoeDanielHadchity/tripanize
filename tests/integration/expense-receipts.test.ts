import { beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { saveExpenseWithReceipts } from "@/server/expenses/receipts";
import { deleteExpense, getExpenseData, type ExpenseInput } from "@/server/expenses/service";
import { readAttachment } from "@/server/storage";
import { addStop } from "@/server/itinerary/service";
import { computeBudget } from "@/server/expenses/budget";
import { makeTrip, makeUser, resetDb } from "./helpers";

const objects = new Map<string, Buffer>();
const put = vi.fn(async (key: string, value: Buffer) => { objects.set(key, Buffer.from(value)); });
beforeEach(async () => {
  await resetDb(); objects.clear(); put.mockReset();
  put.mockImplementation(async (key, value) => { objects.set(key, Buffer.from(value)); });
  setTestRuntime({ ...currentRuntime(), files: {
    put,
    get: async (key: string) => objects.has(key) ? { arrayBuffer: async () => Uint8Array.from(objects.get(key)!).buffer } : null,
    delete: async (key: string) => { objects.delete(key); },
  } as unknown as R2Bucket });
});
const pdf = () => new File(["%PDF-1.4\nreceipt fixture"], "receipt.pdf", { type: "application/pdf" });
const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "camera.jpg", { type: "image/jpeg" });
async function fixture() {
  const owner = await makeUser("Ana");
  const tripId = await makeTrip(owner.id, { budget: "500" });
  const data = await getExpenseData(owner.id, tripId);
  const input: ExpenseInput = { description: "Dinner", amount: "42.50", currency: "EUR", category: "Food & drink", date: "2027-05-01", payerId: data.travelers[0].id, method: "EQUAL", participants: data.travelers.map(t => ({ travelerId: t.id })) };
  return { owner, tripId, input };
}

it("saves photos and PDFs on the payment, with only that payment affecting actual spending", async () => {
  const { owner, tripId, input } = await fixture();
  const day = await prisma.itineraryDay.findFirstOrThrow({ where: { tripId } });
  await addStop(owner.id, tripId, { dayId: day.id, input: { title: "Museum", estCost: "20" } });
  const saved = await saveExpenseWithReceipts(owner.id, tripId, null, input, 0, [pdf(), photo()], []);
  const data = await getExpenseData(owner.id, tripId);
  expect(data.expenses).toHaveLength(1);
  expect(data.expenses[0].id).toBe(saved.id);
  expect(data.expenses[0].receipts.map(f => f.fileName)).toEqual(["receipt.pdf", "camera.jpg"]);
  expect(data.expenses[0].receipts[0]).not.toHaveProperty("storageKey");
  expect(data.ledger[0].totalSpent).toBe(4250);
  const stops = await prisma.stop.findMany({ where: { tripId } });
  expect(computeBudget({ currency: "EUR", budgetMinor: 50000, stops, bookings: [], expenses: data.expenses })).toMatchObject({ actualMinor: 4250, remainingMinor: 45750, projectedMinor: 2000 });
  expect((await readAttachment(owner.id, data.expenses[0].receipts[0].id)).data.toString()).toContain("receipt fixture");
  expect(objects.size).toBe(2);
});

it("adds and removes receipts when editing, keeping files until the payment save commits", async () => {
  const { owner, tripId, input } = await fixture();
  const saved = await saveExpenseWithReceipts(owner.id, tripId, null, input, 0, [pdf()], []);
  const original = (await getExpenseData(owner.id, tripId)).expenses[0];
  await saveExpenseWithReceipts(owner.id, tripId, saved.id, input, original.version, [photo()], [original.receipts[0].id]);
  const updated = (await getExpenseData(owner.id, tripId)).expenses[0];
  expect(updated.receipts.map(r => r.fileName)).toEqual(["camera.jpg"]);
  expect(updated.version).toBe(original.version + 1);
  expect(updated.amountMinor).toBe(4250);
  expect(objects.size).toBe(1);
  await expect(readAttachment(owner.id, original.receipts[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("rolls back payment changes and cleans staged files on invalid details or a later invalid upload", async () => {
  const { owner, tripId, input } = await fixture();
  const notifications = await prisma.tripNotification.count({ where: { tripId } });
  await expect(saveExpenseWithReceipts(owner.id, tripId, null, { ...input, payerId: "wrong" }, 0, [pdf()], [])).rejects.toMatchObject({ code: "VALIDATION" });
  expect(objects.size).toBe(0);
  const spoof = new File(["<script>malicious</script>"], "fake.png", { type: "image/png" });
  await expect(saveExpenseWithReceipts(owner.id, tripId, null, input, 0, [pdf(), spoof], [])).rejects.toMatchObject({ code: "VALIDATION" });
  expect(objects.size).toBe(0);
  expect(await prisma.expense.count({ where: { tripId } })).toBe(0);
  expect(await prisma.attachment.count({ where: { tripId } })).toBe(0);
  expect(await prisma.tripNotification.count({ where: { tripId } })).toBe(notifications);
});

it("does not overwrite a changed payment or remove a receipt belonging to another expense", async () => {
  const { owner, tripId, input } = await fixture();
  const a = await saveExpenseWithReceipts(owner.id, tripId, null, input, 0, [pdf()], []);
  const b = await saveExpenseWithReceipts(owner.id, tripId, null, input, 0, [photo()], []);
  const before = (await getExpenseData(owner.id, tripId)).expenses.find(e => e.id === a.id)!;
  const other = (await getExpenseData(owner.id, tripId)).expenses.find(e => e.id === b.id)!;
  await expect(saveExpenseWithReceipts(owner.id, tripId, a.id, { ...input, amount: "99" }, 0, [photo()], [before.receipts[0].id])).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(saveExpenseWithReceipts(owner.id, tripId, a.id, input, before.version, [], [other.receipts[0].id])).rejects.toMatchObject({ code: "CONFLICT" });
  const after = (await getExpenseData(owner.id, tripId)).expenses.find(e => e.id === a.id)!;
  expect(after).toEqual(before);
  expect(objects.size).toBe(2);
});

it("keeps receipts private to trip members and limits attachment editing to editors", async () => {
  const { owner, tripId, input } = await fixture();
  const viewer = await makeUser("Viewer"), outsider = await makeUser("Outsider");
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const saved = await saveExpenseWithReceipts(owner.id, tripId, null, input, 0, [pdf()], []);
  const receipt = (await getExpenseData(owner.id, tripId)).expenses[0].receipts[0];
  expect((await readAttachment(viewer.id, receipt.id)).meta.id).toBe(receipt.id);
  await expect(readAttachment(outsider.id, receipt.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  put.mockClear();
  await expect(saveExpenseWithReceipts(viewer.id, tripId, saved.id, input, 1, [photo()], [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(saveExpenseWithReceipts(outsider.id, tripId, null, input, 0, [photo()], [])).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(put).not.toHaveBeenCalled();
  await deleteExpense(owner.id, tripId, saved.id);
  await expect(readAttachment(owner.id, receipt.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("rejects empty, mismatched, excessive, and oversize attachments", async () => {
  const { owner, tripId, input } = await fixture();
  for (const files of [Array.from({ length: 6 }, pdf), [new File([], "empty.pdf")], [new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf")], [new File([await pdf().arrayBuffer()], "wrong.png", { type: "image/png" })]]) {
    await expect(saveExpenseWithReceipts(owner.id, tripId, null, input, 0, files, [])).rejects.toMatchObject({ code: "VALIDATION" });
  }
  const saved = await saveExpenseWithReceipts(owner.id, tripId, null, input, 0, Array.from({ length: 5 }, pdf), []);
  await expect(saveExpenseWithReceipts(owner.id, tripId, saved.id, input, 1, [photo()], [])).rejects.toMatchObject({ code: "VALIDATION" });
  expect(objects.size).toBe(5);
  expect((await getExpenseData(owner.id, tripId)).expenses[0].receipts).toHaveLength(5);
});

it("rechecks editing permission after an upload before committing the payment", async () => {
  const { owner, tripId, input } = await fixture();
  const editor = await makeUser("Editor");
  await prisma.tripMembership.create({ data: { tripId, userId: editor.id, role: "COLLABORATOR" } });
  put.mockImplementationOnce(async (key, value) => {
    objects.set(key, Buffer.from(value));
    await prisma.tripMembership.update({ where: { tripId_userId: { tripId, userId: editor.id } }, data: { role: "VIEWER" } });
  });
  await expect(saveExpenseWithReceipts(editor.id, tripId, null, input, 0, [pdf()], [])).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(objects.size).toBe(0);
  expect((await getExpenseData(owner.id, tripId)).expenses).toHaveLength(0);
});

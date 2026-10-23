import { beforeEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { scanExpenseReceipt } from "@/server/expenses/scan";
import { generateStructured, AIError } from "@/server/ai/openai";
import { saveExpenseWithReceipts } from "@/server/expenses/receipts";
import { getExpenseData } from "@/server/expenses/service";
import { makeTrip, makeUser, resetDb } from "./helpers";
const extracted = () => ({ readable: true, merchant: "Cafe fixture", amount: "42.50", currency: "EUR", date: "2027-05-01", category: "Food & drink", uncertain: false });
const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "receipt.jpg", { type: "image/jpeg" });
const generator = (data: unknown = extracted()) => vi.fn(async () => ({ data, model: "fixture", sources: [], usage: null })) as unknown as typeof generateStructured;
const objects = new Map<string, Buffer>();
beforeEach(async () => {
  await resetDb(); objects.clear();
  setTestRuntime({ ...currentRuntime(), planAccessEnabled: false, files: {
    put: async (key: string, data: Buffer) => { objects.set(key, Buffer.from(data)); }, get: async (key: string) => objects.has(key) ? { arrayBuffer: async () => Uint8Array.from(objects.get(key)!).buffer } : null,
    delete: async (key: string) => { objects.delete(key); },
  } as unknown as R2Bucket });
});
async function fixture() { const owner = await makeUser("Owner"); const tripId = await makeTrip(owner.id, { budget: "500" }); return { owner, tripId }; }
it("scans a photo into a review draft without changing expenses, files, estimates or the budget", async () => {
  const { owner, tripId } = await fixture(); const generate = generator();
  const before = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  expect(await scanExpenseReceipt(owner.id, tripId, photo(), generate)).toEqual({ merchant: "Cafe fixture", amount: "42.50", currency: "EUR", date: "2027-05-01", category: "Food & drink", warnings: [] });
  expect(await prisma.expense.count()).toBe(0); expect(await prisma.attachment.count()).toBe(0); expect(objects.size).toBe(0);
  expect(await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).toEqual(before);
  const options = vi.mocked(generate).mock.calls[0][0]; expect(options).toMatchObject({ webSearch: false, metering: { userId: owner.id, tripId }, name: "receipt_scan" });
  expect(JSON.stringify(options.content)).toContain("data:image/jpeg;base64,"); expect(options.instructions).toContain("untrusted DATA");
});
it("handles PDF and existing saved receipts with membership and cross-trip checks", async () => {
  const { owner, tripId } = await fixture(); const pdf = await PDFDocument.create(); pdf.addPage(); const file = new File([Uint8Array.from(await pdf.save())], "receipt.pdf", { type: "application/pdf" });
  const generate = generator(); await scanExpenseReceipt(owner.id, tripId, file, generate);
  expect(JSON.stringify(vi.mocked(generate).mock.calls[0][0].content)).toContain("data:application/pdf;base64,");
  const data = await getExpenseData(owner.id, tripId);
  await saveExpenseWithReceipts(owner.id, tripId, null, { description: "Dinner", category: "Food & drink", amount: "42.50", currency: "EUR", date: "2027-05-01", payerId: data.travelers[0].id, method: "EQUAL", participants: data.travelers.map(t => ({ travelerId: t.id })) }, 0, [file], []);
  const a = await prisma.attachment.findFirstOrThrow({ where: { tripId } });
  expect((await scanExpenseReceipt(owner.id, tripId, a.id, generate)).amount).toBe("42.50");
  const other = await makeTrip(owner.id);
  await expect(scanExpenseReceipt(owner.id, other, a.id, generate)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("never guesses unknown currency, date, total or returns payment card numbers", async () => {
  const { owner, tripId } = await fixture();
  const result = await scanExpenseReceipt(owner.id, tripId, photo(), generator({ ...extracted(), merchant: "4111 1111 1111 1111", currency: "$", amount: "30.50", date: "2027-02-31", uncertain: true }));
  expect(result).toMatchObject({ merchant: null, currency: null, amount: null, date: null }); expect(result.warnings).toHaveLength(4);
  expect((await scanExpenseReceipt(owner.id, tripId, photo(), generator({ ...extracted(), amount: "-20" }))).amount).toBeNull();
  await expect(scanExpenseReceipt(owner.id, tripId, photo(), generator({ ...extracted(), readable: false }))).rejects.toMatchObject({ code: "VALIDATION" });
});
it("blocks Normal trips, viewers, outsiders, suspended users and revoked editing after scanning", async () => {
  const { owner, tripId } = await fixture(); const viewer = await makeUser("Viewer"), outsider = await makeUser("Outside");
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const generate = generator();
  await expect(scanExpenseReceipt(viewer.id, tripId, photo(), generate)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(scanExpenseReceipt(outsider.id, tripId, photo(), generate)).rejects.toMatchObject({ code: "NOT_FOUND" });
  setTestRuntime({ ...currentRuntime(), planAccessEnabled: true });
  await expect(scanExpenseReceipt(owner.id, tripId, photo(), generate)).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(generate).not.toHaveBeenCalled();
  setTestRuntime({ ...currentRuntime(), planAccessEnabled: false });
  const editor = await makeUser("Editor"); await prisma.tripMembership.create({ data: { tripId, userId: editor.id, role: "COLLABORATOR" } });
  const revoked = vi.fn(async () => { await prisma.tripMembership.update({ where: { tripId_userId: { tripId, userId: editor.id } }, data: { role: "VIEWER" } }); return { data: extracted(), model: "fixture", sources: [], usage: null }; }) as unknown as typeof generateStructured;
  await expect(scanExpenseReceipt(editor.id, tripId, photo(), revoked)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.user.update({ where: { id: owner.id }, data: { suspendedAt: new Date() } }); await expect(scanExpenseReceipt(owner.id, tripId, photo(), generate)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("rejects invalid/oversize/multipage files before AI and limits repeated scanning", async () => {
  const { owner, tripId } = await fixture(); const generate = generator();
  const pdf = await PDFDocument.create(); for (let i = 0; i < 6; i++) pdf.addPage();
  for (const file of [new File([], "empty.pdf"), new File(["not a receipt"], "fake.png", { type: "image/png" }), new File(["%PDF invalid"], "bad.pdf", { type: "application/pdf" }), new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.jpg"), new File([Uint8Array.from(await pdf.save())], "six-pages.pdf", { type: "application/pdf" })]) await expect(scanExpenseReceipt(owner.id, tripId, file, generate)).rejects.toMatchObject({ code: "VALIDATION" });
  expect(generate).not.toHaveBeenCalled();
  for (let i = 0; i < 10; i++) await scanExpenseReceipt(owner.id, tripId, photo(), generate);
  await expect(scanExpenseReceipt(owner.id, tripId, photo(), generate)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(generate).toHaveBeenCalledTimes(10);
});
it("returns a useful error on provider failure and keeps actual spending untouched", async () => {
  const { owner, tripId } = await fixture(); const generate = vi.fn(async () => { throw new AIError("TIMEOUT", "fixture"); }) as typeof generateStructured;
  await expect(scanExpenseReceipt(owner.id, tripId, photo(), generate)).rejects.toMatchObject({ code: "TIMEOUT" }); expect(await prisma.expense.count()).toBe(0);
});

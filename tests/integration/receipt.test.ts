import { beforeEach, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/server/db";
import { generateStructured } from "@/server/ai/openai";
import { extractReceipt, toReceiptDraft, validateReceipt } from "@/server/expenses/receipt";
import { createExpense, getExpenseData } from "@/server/expenses/service";
import { makeTrip, makeUser, resetDb } from "./helpers";

vi.mock("@/server/ai/openai", () => ({ aiConfigured: () => true, AIError: class extends Error {}, generateStructured: vi.fn() }));
const raw = { merchant: "Café test", amount: "42.50", currency: "EUR", date: "2027-05-01", category: "Food & drink" as const, warnings: [] };
async function pdfFile(pages = 1) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage();
  return new File([await pdf.save() as Uint8Array<ArrayBuffer>], "receipt.pdf", { type: "application/pdf" });
}
beforeEach(async () => { await resetDb(); vi.clearAllMocks(); });

it("enforces membership and edit permission before contacting AI", async () => {
  const owner = await makeUser("Ana"), outsider = await makeUser("Other"), viewer = await makeUser("Viewer");
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const file = await pdfFile();
  await expect(extractReceipt(outsider.id, tripId, file)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(extractReceipt(viewer.id, tripId, file)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(generateStructured).not.toHaveBeenCalled();
});

it("reads a draft without changing spending, projections, or notifications; saving uses the normal reviewed split", async () => {
  const owner = await makeUser("Ana");
  const tripId = await makeTrip(owner.id, { budget: "500" });
  vi.mocked(generateStructured).mockResolvedValue({ data: raw, sources: [], model: "stub", usage: null });
  const before = await getExpenseData(owner.id, tripId);
  const notifications = await prisma.tripNotification.count({ where: { tripId } });
  const draft = await extractReceipt(owner.id, tripId, await pdfFile());
  expect(draft).toMatchObject({ description: "Café test", amount: "42.50", currency: "EUR" });
  expect(await prisma.expense.count({ where: { tripId } })).toBe(0);
  expect(await prisma.tripNotification.count({ where: { tripId } })).toBe(notifications);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).budgetMinor).toBe(50000);
  const call = vi.mocked(generateStructured).mock.calls[0][0];
  expect(call.webSearch).toBeUndefined();
  expect(call.instructions).toContain("untrusted data");
  expect(call.attachment).toMatchObject({ type: "input_file", filename: "receipt.pdf" });
  expect(call.input).not.toContain(owner.email);
  await createExpense(owner.id, tripId, { ...draft, payerId: before.travelers[0].id, method: "EQUAL", participants: before.travelers.map(t => ({ travelerId: t.id })) });
  const after = await getExpenseData(owner.id, tripId);
  expect(after.ledger[0].totalSpent).toBe(4250);
  expect(after.ledger[0].suggestions).toHaveLength(1);
});

it("rejects mislabeled, unsupported, empty, oversize, and overlong PDF uploads", async () => {
  await expect(validateReceipt(new File(["<script>alert(1)</script>"], "receipt.png", { type: "image/png" }))).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(validateReceipt(new File([], "empty.pdf"))).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(validateReceipt(new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.pdf"))).rejects.toMatchObject({ code: "VALIDATION" });
  const pdf = await pdfFile();
  await expect(validateReceipt(new File([await pdf.arrayBuffer()], "wrong.png", { type: "image/png" }))).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(validateReceipt(await pdfFile(11))).rejects.toMatchObject({ code: "VALIDATION" });
});

it("leaves ambiguous currency, dates and invalid totals for the user to fill in", () => {
  expect(toReceiptDraft({ ...raw, currency: "$", date: "05/06/27", amount: "-42.50" })).toMatchObject({ currency: "", date: "", amount: "" });
  expect(toReceiptDraft({ ...raw, currency: "JPY", amount: "42.50" }).amount).toBe("");
  expect(toReceiptDraft({ ...raw, merchant: "<img onerror=alert(1)>" }).description).toBe("<img onerror=alert(1)>"); // Rendered only as a normal React input value.
});

it("limits receipt AI calls before allowing more paid requests", async () => {
  const owner = await makeUser("Ana");
  const tripId = await makeTrip(owner.id);
  await prisma.rateLimitHit.createMany({ data: Array.from({ length: 10 }, () => ({ key: `receipt:user:${owner.id}` })) });
  await expect(extractReceipt(owner.id, tripId, await pdfFile())).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(generateStructured).not.toHaveBeenCalled();
});

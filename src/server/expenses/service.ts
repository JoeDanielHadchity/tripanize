import { z } from "zod";
import { prisma } from "@/server/db";
import { AppError, conflictError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";
import { isDateStr } from "@/lib/dates";
import { convertMinor, parseMoney } from "@/lib/money";
import { formatZodError } from "@/server/trips/schemas";
import { buildLedger, computeShares, SplitError, type SplitMethod } from "./ledger";

export const expenseInput = z.object({
  description: z.string().trim().min(1, "Add a description").max(160),
  category: z.string().trim().min(1).max(40),
  amount: z.string().trim().min(1, "Enter an amount"),
  currency: z.string().regex(/^[A-Z]{3}$/, "Choose a currency"),
  date: z.string().refine(isDateStr, "Choose the expense date"),
  payerId: z.string().min(1, "Choose who paid"),
  method: z.enum(["EQUAL", "PERCENT", "AMOUNT", "SINGLE"]),
  participants: z.array(z.object({ travelerId: z.string(), value: z.string().optional() })).min(1, "Choose who shares this expense"),
  notes: z.string().max(1000).optional().nullable(),
  bookingId: z.string().optional().nullable(),
  conversion: z
    .object({ currency: z.string().regex(/^[A-Z]{3}$/), rate: z.string().regex(/^\d+(\.\d{1,10})?$/, "Rate must be a positive decimal like 0.92"), rateDate: z.string().refine(isDateStr, "Choose the rate date") })
    .optional()
    .nullable(),
});
export type ExpenseInput = z.input<typeof expenseInput>;

function parsePercentBp(v: string | undefined) {
  if (!v || !/^\d{1,3}(\.\d{1,2})?$/.test(v.trim())) return NaN;
  const [w, f = ""] = v.trim().split(".");
  return Number(w) * 100 + Number((f + "00").slice(0, 2));
}

async function prepare(tripId: string, input: ExpenseInput) {
  const r = expenseInput.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION", formatZodError(r.error));
  const d = r.data;
  const amountMinor = parseMoney(d.amount, d.currency);
  if (amountMinor === null || amountMinor <= 0) throw new AppError("VALIDATION", "Amount must be a positive number with the right number of decimals.");
  const travelers = await prisma.traveler.findMany({ where: { tripId }, select: { id: true } });
  const ids = new Set(travelers.map((t) => t.id));
  if (!ids.has(d.payerId)) throw new AppError("VALIDATION", "The payer isn't a traveler on this trip.");
  if (d.participants.some((p) => !ids.has(p.travelerId))) throw new AppError("VALIDATION", "Everyone in the split must be a traveler on this trip.");
  if (d.bookingId) {
    const b = await prisma.booking.findFirst({ where: { id: d.bookingId, tripId } });
    if (!b) throw new AppError("VALIDATION", "Linked booking not found.");
  }
  let shares;
  try {
    shares = computeShares({
      method: d.method as SplitMethod,
      amountMinor,
      participants: d.participants.map((p) => ({
        travelerId: p.travelerId,
        value: d.method === "PERCENT" ? parsePercentBp(p.value) : d.method === "AMOUNT" ? (parseMoney(p.value ?? "", d.currency) ?? NaN) : undefined,
      })),
    });
  } catch (e) {
    if (e instanceof SplitError) throw new AppError("VALIDATION", e.message);
    throw e;
  }
  let conv: { convCurrency: string | null; convRate: string | null; convRateDate: string | null; convAmountMinor: number | null } = { convCurrency: null, convRate: null, convRateDate: null, convAmountMinor: null };
  if (d.conversion && d.conversion.currency !== d.currency) {
    if (Number(d.conversion.rate) <= 0) throw new AppError("VALIDATION", "Conversion rate must be greater than zero.");
    conv = { convCurrency: d.conversion.currency, convRate: d.conversion.rate, convRateDate: d.conversion.rateDate, convAmountMinor: convertMinor(amountMinor, d.currency, d.conversion.currency, d.conversion.rate) };
  }
  return { d, amountMinor, shares, conv };
}

export async function createExpense(userId: string, tripId: string, input: ExpenseInput) {
  await requireTrip(tripId, userId, "edit");
  const { d, amountMinor, shares, conv } = await prepare(tripId, input);
  return prisma.$transaction(async (tx) => {
    const e = await tx.expense.create({
      data: {
        tripId, description: d.description, category: d.category, amountMinor, currency: d.currency, date: d.date, payerId: d.payerId, splitMethod: d.method, notes: d.notes || null, bookingId: d.bookingId || null, createdById: userId, ...conv,
        shares: { create: shares.map((s) => ({ travelerId: s.travelerId, amountMinor: s.amountMinor, percentBp: s.percentBp })) },
      },
    });
    await recordChange(tx, { tripId, actorId: userId, entity: "expense", entityId: e.id, action: "create", after: { description: e.description, amountMinor, currency: d.currency, payerId: d.payerId, shares } });
    return e;
  });
}

export async function updateExpense(userId: string, tripId: string, expenseId: string, input: ExpenseInput, version: number) {
  await requireTrip(tripId, userId, "edit");
  const { d, amountMinor, shares, conv } = await prepare(tripId, input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.expense.findFirst({ where: { id: expenseId, tripId, deletedAt: null }, include: { shares: true } });
    if (!before) throw new AppError("NOT_FOUND", "Expense not found. It may have been deleted.");
    const res = await tx.expense.updateMany({
      where: { id: expenseId, version, deletedAt: null },
      data: { description: d.description, category: d.category, amountMinor, currency: d.currency, date: d.date, payerId: d.payerId, splitMethod: d.method, notes: d.notes || null, bookingId: d.bookingId || null, ...conv, version: { increment: 1 } },
    });
    if (!res.count) throw conflictError(`The expense “${before.description}”`);
    await tx.expenseShare.deleteMany({ where: { expenseId } });
    await tx.expenseShare.createMany({ data: shares.map((s) => ({ expenseId, travelerId: s.travelerId, amountMinor: s.amountMinor, percentBp: s.percentBp })) });
    await recordChange(tx, {
      tripId, actorId: userId, entity: "expense", entityId: expenseId, action: "update",
      before: { description: before.description, amountMinor: before.amountMinor, currency: before.currency, payerId: before.payerId, shares: before.shares.map((s) => ({ travelerId: s.travelerId, amountMinor: s.amountMinor })) },
      after: { description: d.description, amountMinor, currency: d.currency, payerId: d.payerId, shares },
    });
  });
}

/** Soft delete so the audit trail and history remain. */
export async function deleteExpense(userId: string, tripId: string, expenseId: string) {
  await requireTrip(tripId, userId, "edit");
  await prisma.$transaction(async (tx) => {
    const e = await tx.expense.findFirst({ where: { id: expenseId, tripId, deletedAt: null } });
    if (!e) throw new AppError("NOT_FOUND", "Expense not found.");
    await tx.expense.update({ where: { id: expenseId }, data: { deletedAt: new Date(), version: { increment: 1 } } });
    await recordChange(tx, { tripId, actorId: userId, entity: "expense", entityId: expenseId, action: "delete", before: { description: e.description, amountMinor: e.amountMinor, currency: e.currency } });
  });
}

const settlementInput = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  amount: z.string().min(1, "Enter an amount"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  paidAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Choose when the repayment was made"),
  note: z.string().max(300).optional().nullable(),
});

/** Records a repayment between travelers. This is a ledger entry — no money is moved by Tripanize. */
export async function recordSettlement(userId: string, tripId: string, input: z.input<typeof settlementInput>) {
  await requireTrip(tripId, userId, "edit");
  const r = settlementInput.safeParse(input);
  if (!r.success) throw new AppError("VALIDATION", formatZodError(r.error));
  const d = r.data;
  if (d.fromId === d.toId) throw new AppError("VALIDATION", "Sender and recipient must be different people.");
  const amountMinor = parseMoney(d.amount, d.currency);
  if (!amountMinor || amountMinor <= 0) throw new AppError("VALIDATION", "Repayment amount must be greater than zero.");
  const count = await prisma.traveler.count({ where: { tripId, id: { in: [d.fromId, d.toId] } } });
  if (count !== 2) throw new AppError("VALIDATION", "Both people must be travelers on this trip.");
  if (new Date(d.paidAt).getTime() > Date.now() + 5 * 60_000) throw new AppError("VALIDATION", "A repayment can't be recorded in the future.");
  return prisma.$transaction(async (tx) => {
    const s = await tx.settlement.create({ data: { tripId, fromId: d.fromId, toId: d.toId, amountMinor, currency: d.currency, paidAt: new Date(d.paidAt), note: d.note || null, createdById: userId } });
    await recordChange(tx, { tripId, actorId: userId, entity: "settlement", entityId: s.id, action: "create", after: { fromId: d.fromId, toId: d.toId, amountMinor, currency: d.currency } });
    return s;
  });
}

export async function deleteSettlement(userId: string, tripId: string, settlementId: string) {
  await requireTrip(tripId, userId, "edit");
  await prisma.$transaction(async (tx) => {
    const s = await tx.settlement.findFirst({ where: { id: settlementId, tripId, deletedAt: null } });
    if (!s) throw new AppError("NOT_FOUND", "Repayment not found.");
    await tx.settlement.update({ where: { id: settlementId }, data: { deletedAt: new Date() } });
    await recordChange(tx, { tripId, actorId: userId, entity: "settlement", entityId: settlementId, action: "delete", before: { amountMinor: s.amountMinor, currency: s.currency } });
  });
}

export async function getExpenseData(userId: string, tripId: string) {
  const access = await requireTrip(tripId, userId, "view");
  const [trip, travelers, expenses, settlements, audit] = await Promise.all([
    prisma.trip.findUniqueOrThrow({ where: { id: tripId } }),
    prisma.traveler.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } }),
    prisma.expense.findMany({ where: { tripId, deletedAt: null }, include: { shares: true, booking: { select: { id: true, title: true } } } }),
    prisma.settlement.findMany({ where: { tripId, deletedAt: null }, orderBy: { paidAt: "desc" } }),
    prisma.auditLog.findMany({ where: { tripId, entity: { in: ["expense", "settlement"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const ledger = buildLedger(
    travelers.map((t) => t.id),
    expenses.map((e) => ({
      id: e.id, amountMinor: e.amountMinor, currency: e.currency, category: e.category, payerId: e.payerId,
      shares: e.shares.map((s) => ({ travelerId: s.travelerId, amountMinor: s.amountMinor })),
      conversion: e.convCurrency && e.convRate ? { currency: e.convCurrency, rate: e.convRate } : null,
    })),
    settlements.map((s) => ({ fromId: s.fromId, toId: s.toId, amountMinor: s.amountMinor, currency: s.currency })),
  );
  return { access, trip, travelers, expenses, settlements, ledger, audit };
}

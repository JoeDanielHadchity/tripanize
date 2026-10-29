import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getExpenseData } from "@/server/expenses/service";
import { computeBudget } from "@/server/expenses/budget";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { todayIn } from "@/lib/dates";
import { f, act, go, form, options } from "./presentation";
import type { MobileBlock } from "@/lib/mobile-workspace";

export async function expenseBlocks(userId: string, tripId: string, screen: string, item: string | undefined, canEdit: boolean): Promise<MobileBlock[]> {
  const data = await getExpenseData(userId, tripId);
  const travelers = data.travelers.map(t => ({ value: t.id, label: t.name })), name = (id: string) => data.travelers.find(t => t.id === id)?.name ?? "Former traveler";
  const today = todayIn(data.trip.timezone);
  const bookings = await prisma.booking.findMany({ where: { tripId }, include: { expenses: { where: { deletedAt: null }, select: { id: true } } } });
  if (screen === "expense") {
    if (!canEdit) throw new AppError("FORBIDDEN", "Only the organizer and editors can record payments.");
    const e = item && !item.startsWith("booking:") ? data.expenses.find(e => e.id === item) : null;
    const b = item?.startsWith("booking:") ? bookings.find(b => b.id === item.slice(8)) : null;
    if (item && !e && !b) throw new AppError("NOT_FOUND", "Payment or booking not found.");
    const payer = data.travelers.find(t => t.userId === userId)?.id ?? data.travelers.find(t => !t.leftAt)?.id ?? "";
    const block = form("expense", e ? "Edit payment" : "Add payment", "expense.save", [f("description", "Description", "text", { required: true }), f("amount", "Amount paid", "money", { required: true }), f("currency", "Currency"), f("date", "Payment date", "date"), f("category", "Category", "select", { options: options(EXPENSE_CATEGORIES) }), f("payerId", "Who paid?", "select", { options: travelers }), f("method", "Split method", "select", { options: [{ value: "EQUAL", label: "Equally" }, { value: "PERCENT", label: "Percentages" }, { value: "AMOUNT", label: "Exact amounts" }, { value: "SINGLE", label: "One person" }] }), f("participants", "Who shares this payment?", "repeat", { max: 50, fields: [f("travelerId", "Traveler", "select", { options: travelers }), f("value", "Share", "money", { hint: "Leave blank for equal split. For percentage or exact split, enter their share." })] }), f("bookingId", "Linked booking", "select", { options: [{ value: "", label: "None" }, ...bookings.map(b => ({ value: b.id, label: b.title }))] }), f("notes", "Notes", "long"), f("conversion.currency", "Convert to currency (optional)"), f("conversion.rate", "Exchange rate", "money"), f("conversion.rateDate", "Rate date", "date"), f("files", "Receipts · photo, image or PDF", "files"), ...(e?.receipts.length ? [f("removeIds", "Remove attached receipts", "multi", { options: e.receipts.map(r => ({ value: r.id, label: r.fileName })) })] : [])], {
      id: e?.id ?? null, version: e?.version ?? 0, description: e?.description ?? b?.title ?? "", amount: e ? minorToDecimalString(e.amountMinor, e.currency) : b && (b.finalCostMinor ?? b.estCostMinor) !== null ? minorToDecimalString((b.finalCostMinor ?? b.estCostMinor)!, b.currency) : "", currency: e?.currency ?? b?.currency ?? data.trip.currency, date: e?.date ?? b?.date ?? today, category: e?.category ?? "Other", payerId: e?.payerId ?? payer, method: e?.splitMethod ?? "EQUAL", participants: e ? e.shares.map(s => ({ travelerId: s.travelerId, value: e.splitMethod === "PERCENT" ? String((s.percentBp ?? 0) / 100) : e.splitMethod === "AMOUNT" ? minorToDecimalString(s.amountMinor, e.currency) : "" })) : data.travelers.filter(t => !t.leftAt).map(t => ({ travelerId: t.id, value: "" })), bookingId: e?.bookingId ?? b?.id ?? null, notes: e?.notes ?? "", conversion: e?.convCurrency ? { currency: e.convCurrency, rate: e.convRate, rateDate: e.convRateDate } : { currency: "", rate: "", rateDate: "" }, removeIds: [],
    }, "Save payment & receipts");
    block.form!.upload = "expense";
    return [{ id: "separate", text: "Recorded payments reduce the remaining budget. Planning estimates stay separate." }, block, ...(e?.receipts.map(r => ({ id: r.id, title: r.fileName, actions: [{ label: "Open receipt", device: "file" as const, url: `/api/mobile/files?attachmentId=${encodeURIComponent(r.id)}`, fileName: r.fileName }] })) ?? []), ...(e ? [{ id: "delete", actions: [act("Delete payment", "expense.delete", { id: e.id }, "Remove this payment and its receipt attachments from the shared ledger?")] }] : [])];
  }
  if (screen === "settlement") {
    if (!canEdit) throw new AppError("FORBIDDEN", "Only the organizer and editors can record repayments.");
    return [{ id: "explain", text: "Record money already paid outside Tripanize. Repayments settle balances and do not increase trip spending." }, form("settlement", "Record repayment", "settlement.save", [f("fromId", "Who repaid?", "select", { options: travelers }), f("toId", "Who received it?", "select", { options: travelers }), f("amount", "Amount", "money"), f("currency", "Currency", "text", { value: data.trip.currency }), f("paidAt", "Date paid", "date", { value: today }), f("note", "Note", "long")], {}, "Record repayment")];
  }
  const stops = await prisma.stop.findMany({ where: { tripId, dayId: { not: null } }, select: { plan: true, status: true, bookingId: true, estCostMinor: true, currency: true } });
  const budget = computeBudget({ currency: data.trip.currency, budgetMinor: data.trip.budgetMinor, stops, bookings: bookings.map(b => ({ ...b, hasExpense: b.expenses.length > 0 })), expenses: data.expenses });
  const money = (minor: number | null) => minor === null ? "Not set" : formatMoney(minor, budget.currency);
  const blocks: MobileBlock[] = [{ id: "budget", title: `Budget · ${money(budget.budgetMinor)}`, text: `Remaining · ${money(budget.remainingMinor)}`, lines: [`Actual spending · ${money(budget.actualMinor)}`], tone: "accent", actions: canEdit ? [go("Add payment & receipts", "expense", tripId), go("Record repayment", "settlement", tripId)] : [] }, { id: "projection", title: "Planning estimates", text: money(budget.projectedMinor), lines: [`Bookings · ${money(budget.estimatedBookingsMinor)}`, `Activities · ${money(budget.plannedActivitiesMinor)}`, "Estimates do not increase when you record a payment."] }];
  for (const c of budget.otherCurrencies) blocks.push({ id: `currency-${c.currency}`, title: c.currency, text: `Actual: ${formatMoney(c.actualMinor, c.currency)} · Estimated: ${formatMoney(c.estimatedMinor, c.currency)}`, meta: "Separate currency · no automatic conversion" });
  for (const ledger of data.ledger) {
    blocks.push({ id: `ledger-${ledger.currency}`, title: `Who owes whom · ${ledger.currency}`, lines: ledger.suggestions.length ? ledger.suggestions.map(s => `${name(s.fromId)} owes ${name(s.toId)} ${formatMoney(s.amountMinor, ledger.currency)}`) : ["All settled."] });
  }
  for (const e of [...data.expenses].sort((a, b) => b.date.localeCompare(a.date))) blocks.push({ id: e.id, title: `${e.description} · ${formatMoney(e.amountMinor, e.currency)}`, meta: `${e.date} · ${e.category} · Paid by ${name(e.payerId)}`, text: e.notes ?? undefined, lines: e.shares.map(s => `${name(s.travelerId)}: ${formatMoney(s.amountMinor, e.currency)}`), actions: [...(canEdit ? [go("Edit payment / receipts", "expense", tripId, e.id)] : []), ...e.receipts.map(r => ({ label: r.fileName, device: "file" as const, url: `/api/mobile/files?attachmentId=${encodeURIComponent(r.id)}`, fileName: r.fileName }))] });
  for (const s of data.settlements) blocks.push({ id: s.id, title: `${name(s.fromId)} repaid ${name(s.toId)}`, text: formatMoney(s.amountMinor, s.currency), meta: s.paidAt.toISOString().slice(0, 10), actions: canEdit ? [act("Remove repayment", "settlement.delete", { id: s.id }, "Remove this recorded repayment?")] : [] });
  for (const a of data.audit) blocks.push({ id: a.id, meta: `${a.createdAt.toISOString()} · ${a.actorName ?? "Trip member"}`, text: `${a.entity} · ${a.action}` });
  return blocks;
}

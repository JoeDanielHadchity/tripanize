import { getMemberTripPlan } from "@/server/plans/access";
import { PremiumRequired } from "@/components/premium-required";
import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { prisma } from "@/server/db";
import { roleAllows } from "@/server/auth/permissions";
import { getExpenseData } from "@/server/expenses/service";
import { computeBudget } from "@/server/expenses/budget";
import { PageHeader } from "@/components/ui";
import { todayIn } from "@/lib/dates";
import { ExpensesView } from "./view";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ params, searchParams }: { params: Promise<{ tripId: string }>; searchParams: Promise<{ fromBooking?: string }> }) {
  const { tripId } = await params;
  const { fromBooking } = await searchParams;
  const user = await requireUser();
  if (!(await getMemberTripPlan(tripId, user.id)).premium) return <PremiumRequired feature="expenses" />;
  const data = await getExpenseData(user.id, tripId);
  const [stops, bookings] = await Promise.all([
    prisma.stop.findMany({ where: { tripId, dayId: { not: null } }, select: { plan: true, status: true, bookingId: true, estCostMinor: true, currency: true, day: { select: { activePlan: true } } } }),
    prisma.booking.findMany({ where: { tripId }, include: { expenses: { where: { deletedAt: null }, select: { id: true } } } }),
  ]);
  const budget = computeBudget({
    currency: data.trip.currency,
    budgetMinor: data.trip.budgetMinor,
    stops: stops.map((s) => ({ plan: s.plan, status: s.status, bookingId: s.bookingId, estCostMinor: s.estCostMinor, currency: s.currency })),
    bookings: bookings.map((b) => ({ id: b.id, status: b.status, estCostMinor: b.estCostMinor, finalCostMinor: b.finalCostMinor, currency: b.currency, hasExpense: b.expenses.length > 0 })),
    expenses: data.expenses.map((e) => ({ amountMinor: e.amountMinor, currency: e.currency, category: e.category, convCurrency: e.convCurrency, convAmountMinor: e.convAmountMinor })),
  });
  const prefill = fromBooking ? bookings.find((b) => b.id === fromBooking && b.expenses.length === 0) : null;
  const me = data.travelers.find((t) => t.userId === user.id);
  return (
    <>
      <PageHeader title="Expenses & settlements" subtitle="Shared ledger in exact amounts. Different currencies are never added together." />
      <ExpensesView
        tripId={tripId}
        canEdit={roleAllows(data.access.role, "edit")}
        tripCurrency={data.trip.currency}
        timezone={data.trip.timezone}
        today={todayIn(data.trip.timezone)}
        meId={me?.id ?? null}
        travelers={data.travelers.map((t) => ({ id: t.id, name: t.name, active: !t.leftAt }))}
        expenses={data.expenses.map((e) => ({ id: e.id, version: e.version, description: e.description, category: e.category, amountMinor: e.amountMinor, currency: e.currency, date: e.date, createdAt: e.createdAt.toISOString(), payerId: e.payerId, splitMethod: e.splitMethod, notes: e.notes, bookingId: e.bookingId, bookingTitle: e.booking?.title ?? null, receipts: e.receipts, shares: e.shares.map((s) => ({ travelerId: s.travelerId, amountMinor: s.amountMinor, percentBp: s.percentBp })), conversion: e.convCurrency ? { currency: e.convCurrency, rate: e.convRate!, rateDate: e.convRateDate!, amountMinor: e.convAmountMinor! } : null }))}
        settlements={data.settlements.map((s) => ({ id: s.id, fromId: s.fromId, toId: s.toId, amountMinor: s.amountMinor, currency: s.currency, paidAt: s.paidAt.toISOString(), note: s.note }))}
        ledger={data.ledger}
        budget={budget}
        audit={data.audit.map((a) => ({ id: a.id, at: a.createdAt.toISOString(), actor: a.actorName, entity: a.entity, action: a.action, before: a.before, after: a.after }))}
        bookings={bookings.filter((b) => b.status !== "CANCELLED").map((b) => ({ id: b.id, title: b.title, hasExpense: b.expenses.length > 0 }))}
        prefill={prefill ? { bookingId: prefill.id, description: prefill.title, amountMinor: prefill.finalCostMinor ?? prefill.estCostMinor, currency: prefill.currency, category: prefill.category === "ACCOMMODATION" ? "Accommodation" : prefill.category === "RESTAURANT" ? "Food & drink" : ["FLIGHT", "TRAIN", "TRANSPORT", "CAR_RENTAL"].includes(prefill.category) ? "Transport" : "Activities", date: prefill.date } : null}
      />
    </>
  );
}

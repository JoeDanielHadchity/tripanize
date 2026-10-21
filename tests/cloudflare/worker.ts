import { DurableObject } from "cloudflare:workers";
import schema from "../../prisma/migrations/202610220001_cloudflare_initial/migration.sql";
import { createDatabase } from "../../src/server/db";
import { DurableSqliteAdapter } from "../../src/server/cloudflare/sqlite-adapter";
import { appRuntime } from "../../src/server/cloudflare/runtime";
import { createTrip } from "../../src/server/trips/service";
import { createBooking } from "../../src/server/bookings/service";
import { createExpense } from "../../src/server/expenses/service";
import { readAttachment, saveAttachment } from "../../src/server/storage";
import { exportTripPdf } from "../../src/server/export";

interface Env { PROBE: DurableObjectNamespace; FILES: R2Bucket; ASSETS: Fetcher }
export class StorageProbe extends DurableObject<Env> {
  private db = createDatabase(new DurableSqliteAdapter(this.ctx.storage));
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      if (!await ctx.storage.get("ready")) { ctx.storage.transactionSync(() => ctx.storage.sql.exec(schema)); await ctx.storage.put("ready", true); }
    });
  }
  async fetch(request: Request) {
    try {
      return await appRuntime.run({ database: this.db, files: this.env.FILES, assets: this.env.ASSETS, authSecret: "test-only-not-used-for-production" }, async () => {
        if (new URL(request.url).pathname === "/count") return Response.json({ users: await this.db.user.count() });
        const id = crypto.randomUUID();
        const user = await this.db.user.create({ data: { id, email: `${id}@example.test`, name: "Cloudflare fixture" } });
        const tripId = await createTrip(user.id, { name: "Cloudflare migration check", startDate: "2027-05-01", endDate: "2027-05-03", timezone: "Europe/Paris", currency: "EUR", destinations: [{ name: "Paris" }], travelers: [{ name: "Companion", isChild: false }], interests: ["architecture"] });
        const trip = await this.db.trip.findUniqueOrThrow({ where: { id: tripId }, include: { days: true, travelers: true } });
        const booking = await createBooking(user.id, tripId, { title: "Museum booking", category: "ATTRACTION", status: "BOOKED", currency: "EUR", date: "2027-05-02", startTime: "10:00", durationMin: 90 });
        const expense = await createExpense(user.id, tripId, { description: "Tickets", category: "Attractions", amount: "30.01", currency: "EUR", date: "2027-05-02", payerId: trip.travelers[0].id, method: "EQUAL", participants: trip.travelers.map((t) => ({ travelerId: t.id })) });
        const shares = await this.db.expenseShare.findMany({ where: { expenseId: expense.id } });
        const updated = await this.db.expense.updateMany({ where: { id: expense.id, version: 1 }, data: { version: { increment: 1 } } });
        const stale = await this.db.expense.updateMany({ where: { id: expense.id, version: 1 }, data: { version: { increment: 1 } } });
        const rollbackId = crypto.randomUUID();
        try { await this.db.$transaction(async (tx) => { await tx.user.create({ data: { id: rollbackId, name: "Must roll back", email: `${rollbackId}@example.test` } }); throw new Error("intentional rollback"); }); } catch (error) { if (!(error instanceof Error) || error.message !== "intentional rollback") throw error; }
        const rolledBack = !await this.db.user.findUnique({ where: { id: rollbackId } });
        const bytes = "%PDF-1.4\nprivate fixture";
        const file = await saveAttachment(user.id, tripId, booking.id, new File([bytes], "ticket.pdf", { type: "application/pdf" }));
        const stored = await readAttachment(user.id, file.id);
        const pdf = await exportTripPdf(user.id, tripId, {});
        return Response.json({
          days: trip.days.length, interests: trip.interests,
          bookingProjections: await this.db.stop.count({ where: { bookingId: booking.id } }),
          totalMinor: shares.reduce((n, s) => n + s.amountMinor, 0), rolledBack,
          updatedRows: updated.count, staleRows: stale.count,
          privateFileRoundTrip: stored.data.toString() === bytes,
          pdfHeader: pdf.subarray(0, 4).toString(),
          users: await this.db.user.count(),
        });
      });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 }); }
  }
}
export default { fetch(request: Request, env: Env) { return env.PROBE.getByName("fixture").fetch(request); } };

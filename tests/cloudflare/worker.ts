import { DurableObject } from "cloudflare:workers";
import schema from "../../prisma/migrations/202610220001_cloudflare_initial/migration.sql";
import eventBookings from "../../prisma/migrations/202610220002_event_bookings/migration.sql";
import tripNotifications from "../../prisma/migrations/202610220003_trip_notifications/migration.sql";
import memberLocations from "../../prisma/migrations/202610220004_member_locations/migration.sql";
import tripChat from "../../prisma/migrations/202610220005_trip_chat/migration.sql";
import expenseReceipts from "../../prisma/migrations/202610220006_expense_receipts/migration.sql";
import { changeMemberLocation, getLocationSelf, getMemberLocations } from "../../src/server/locations/service";
import { createDatabase } from "../../src/server/db";
import { DurableSqliteAdapter } from "../../src/server/cloudflare/sqlite-adapter";
import { appRuntime } from "../../src/server/cloudflare/runtime";
import { createTrip } from "../../src/server/trips/service";
import { createBooking } from "../../src/server/bookings/service";
import { addCustomEvent, scheduleEvent } from "../../src/server/events/service";
import { saveExpenseWithReceipts } from "../../src/server/expenses/receipts";
import { createExpense } from "../../src/server/expenses/service";
import { readAttachment, saveAttachment } from "../../src/server/storage";
import { exportTripPdf } from "../../src/server/export";
import { deleteChatMessage, getChatPage, getChatSummary, markChatRead, sendChatMessage } from "../../src/server/chat/service";

interface Env { PROBE: DurableObjectNamespace; FILES: R2Bucket; ASSETS: Fetcher }
export class StorageProbe extends DurableObject<Env> {
  private db = createDatabase(new DurableSqliteAdapter(this.ctx.storage));
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      if (!await ctx.storage.get("ready")) { ctx.storage.transactionSync(() => ctx.storage.sql.exec(schema)); await ctx.storage.put("ready", true); }
      ctx.storage.transactionSync(() => {
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Booking")').toArray().some(column => column.name === "eventId")) ctx.storage.sql.exec(eventBookings);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("NotificationPreference")').toArray().some(column => column.name === "changeEmailEnabled")) ctx.storage.sql.exec(tripNotifications);
        ctx.storage.sql.exec(memberLocations);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "chatSeq")) ctx.storage.sql.exec(tripChat);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Attachment")').toArray().some(column => column.name === "expenseId")) ctx.storage.sql.exec(expenseReceipts);
      });
    });
  }
  async fetch(request: Request) {
    try {
      return await appRuntime.run({ database: this.db, files: this.env.FILES, assets: this.env.ASSETS, authSecret: "test-only-not-used-for-production" }, async () => {
        if (new URL(request.url).pathname === "/count") return Response.json({ users: await this.db.user.count() });
        if (new URL(request.url).pathname === "/expense-receipt") {
          const fixture = await this.ctx.storage.get<{ userId: string; expenseId: string; receiptId: string }>("expense-receipt-fixture");
          if (!fixture) throw new Error("Missing receipt fixture");
          const file = await readAttachment(fixture.userId, fixture.receiptId);
          return Response.json({ linked: file.meta.expenseId === fixture.expenseId, readable: file.data.toString().includes("private fixture") });
        }
        if (new URL(request.url).pathname === "/chat-count") { const chat = await this.ctx.storage.get<{ userId: string; tripId: string }>("chat-fixture"); return Response.json(chat ? { messages: await this.db.chatMessage.count({ where: { tripId: chat.tripId } }), unread: (await getChatSummary(chat.userId, chat.tripId)).unread } : null); }
        const id = crypto.randomUUID();
        const user = await this.db.user.create({ data: { id, email: `${id}@example.test`, name: "Cloudflare fixture" } });
        const tripId = await createTrip(user.id, { name: "Cloudflare migration check", startDate: "2027-05-01", endDate: "2027-05-03", timezone: "Europe/Paris", currency: "EUR", destinations: [{ name: "Paris" }], travelers: [{ name: "Companion", isChild: false }], interests: ["architecture"] });
        const trip = await this.db.trip.findUniqueOrThrow({ where: { id: tripId }, include: { days: true, travelers: true } });
        const location = await changeMemberLocation(user.id, tripId, { op: "start", scope: (await getLocationSelf(user.id, tripId)).scope, token: "isolated-location-lease-01234567890123456789", expectedVersion: 0, lat: 48.85, lng: 2.35, accuracy: 25, capturedAt: new Date().toISOString() });
        const locationVisible = (await getMemberLocations(user.id, tripId)).locations.length === 1;
        await changeMemberLocation(user.id, tripId, { op: "stop" });
        const locationCleared = (await getMemberLocations(user.id, tripId)).locations.length === 0 && (await this.db.memberLocation.findFirstOrThrow({ where: { sessionId: null } })).lat === null;
        const recipientId = crypto.randomUUID();
        await this.db.user.create({ data: { id: recipientId, name: "Chat recipient fixture", email: `${recipientId}@example.test` } });
        await this.db.tripMembership.create({ data: { tripId, userId: recipientId, role: "VIEWER" } });
        const chatInput = { clientId: crypto.randomUUID(), body: "Native chat fixture" };
        const chatMessage = await sendChatMessage(user.id, tripId, chatInput);
        const chatRetry = await sendChatMessage(user.id, tripId, chatInput);
        const chatBefore = await getChatPage(recipientId, tripId);
        const chatUnread = chatBefore.summary.unread;
        await markChatRead(recipientId, tripId, chatMessage.seq);
        const chatRead = (await getChatSummary(recipientId, tripId)).unread === 0;
        await deleteChatMessage(user.id, tripId, chatMessage.id);
        const chatDeleted = (await getChatPage(recipientId, tripId, { since: chatBefore.revision })).messages[0].body === "";
        await this.ctx.storage.put("chat-fixture", { userId: recipientId, tripId });
        const booking = await createBooking(user.id, tripId, { title: "Museum booking", category: "ATTRACTION", status: "BOOKED", currency: "EUR", date: "2027-05-02", startTime: "10:00", durationMin: 90 });
        const event = await addCustomEvent(user.id, tripId, { title: "Concert fixture", date: "2027-05-02", bookingUrl: "https://example.test/tickets" });
        const eventBooking = await createBooking(user.id, tripId, { eventId: event.id, title: event.title, category: "EXPERIENCE", status: "TO_BOOK", currency: "EUR", date: "2027-05-02" });
        const suggestionStayedUnscheduled = await this.db.stop.count({ where: { eventId: event.id } }) === 0;
        await scheduleEvent(user.id, tripId, event.id, trip.days.find(day => day.date === "2027-05-02")!.id, "19:00", 90);
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
        const multipart = new FormData();
        multipart.append("receipts", new File([bytes], "payment-receipt.pdf", { type: "application/pdf" }));
        const upload = new Request("https://fixture.test/payment", { method: "POST", body: multipart });
        const parsed = await new Response(await upload.arrayBuffer(), { headers: { "Content-Type": upload.headers.get("Content-Type")! } }).formData();
        const receiptFile = parsed.get("receipts");
        if (!(receiptFile instanceof File)) throw new Error("Multipart receipt must be a File");
        const receiptExpense = await saveExpenseWithReceipts(user.id, tripId, null, { description: "Receipt fixture", category: "Food & drink", amount: "12", currency: "EUR", date: "2027-05-02", payerId: trip.travelers[0].id, method: "EQUAL", participants: trip.travelers.map(t => ({ travelerId: t.id })) }, 0, [receiptFile], []);
        const receipt = await this.db.attachment.findFirstOrThrow({ where: { expenseId: receiptExpense.id } });
        const savedReceipt = await readAttachment(recipientId, receipt.id);
        await this.ctx.storage.put("expense-receipt-fixture", { userId: recipientId, expenseId: receiptExpense.id, receiptId: receipt.id });
        const pdf = await exportTripPdf(user.id, tripId, {});
        return Response.json({
          days: trip.days.length, interests: trip.interests,
          locationVisible: Boolean(location.sessionId) && locationVisible, locationCleared,
          chatDeduplicated: chatMessage.id === chatRetry.id, chatUnread, chatRead, chatDeleted,
          bookingProjections: await this.db.stop.count({ where: { bookingId: booking.id } }),
          linkedEventProjections: await this.db.stop.count({ where: { bookingId: eventBooking.id, eventId: event.id } }), suggestionStayedUnscheduled,
          totalMinor: shares.reduce((n, s) => n + s.amountMinor, 0), rolledBack,
          updatedRows: updated.count, staleRows: stale.count,
          privateFileRoundTrip: stored.data.toString() === bytes,
          expenseReceiptRoundTrip: savedReceipt.data.toString() === bytes && savedReceipt.meta.expenseId === receiptExpense.id,
          pdfHeader: pdf.subarray(0, 4).toString(),
          users: await this.db.user.count(),
        });
      });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 }); }
  }
}
export default { fetch(request: Request, env: Env) { return env.PROBE.getByName("fixture").fetch(request); } };

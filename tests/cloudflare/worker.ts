import destinationSearches from "../../prisma/migrations/202610230014_destination_searches/migration.sql";
import companyTrials from "../../prisma/migrations/202610230013_company_trials/migration.sql";
import eventAlerts from "../../prisma/migrations/202610230012_event_alerts/migration.sql";
import destinationSearch from "../../prisma/migrations/202610230011_destination_search/migration.sql";
import { DurableObject } from "cloudflare:workers";
import schema from "../../prisma/migrations/202610220001_cloudflare_initial/migration.sql";
import eventBookings from "../../prisma/migrations/202610220002_event_bookings/migration.sql";
import tripNotifications from "../../prisma/migrations/202610220003_trip_notifications/migration.sql";
import memberLocations from "../../prisma/migrations/202610220004_member_locations/migration.sql";
import tripChat from "../../prisma/migrations/202610220005_trip_chat/migration.sql";
import expenseReceipts from "../../prisma/migrations/202610220006_expense_receipts/migration.sql";
import tripPurchases from "../../prisma/migrations/202610220008_trip_purchases/migration.sql";
import planAccess from "../../prisma/migrations/202610220007_plan_access/migration.sql";
import guidedSetup from "../../prisma/migrations/202610230010_guided_setup/migration.sql";
import tripFeatures from "../../prisma/migrations/202610230009_trip_features/migration.sql";
import { changeMemberLocation, getLocationSelf, getMemberLocations } from "../../src/server/locations/service";
import { createDatabase } from "../../src/server/db";
import { DurableSqliteAdapter } from "../../src/server/cloudflare/sqlite-adapter";
import { appRuntime } from "../../src/server/cloudflare/runtime";
import { createTrip } from "../../src/server/trips/service";
import { createBooking } from "../../src/server/bookings/service";
import { getItinerary } from "../../src/server/itinerary/service";
import { addCustomEvent, scheduleEvent } from "../../src/server/events/service";
import { saveExpenseWithReceipts } from "../../src/server/expenses/receipts";
import { createExpense } from "../../src/server/expenses/service";
import { readAttachment, saveAttachment } from "../../src/server/storage";
import { exportTripPdf } from "../../src/server/export";
import { deleteChatMessage, getChatPage, getChatSummary, markChatRead, sendChatMessage } from "../../src/server/chat/service";
import { saveTripFeatures } from "../../src/server/plans/selection";
import { getTripPlan } from "../../src/server/plans/access";
import { planningScope } from "../../src/server/plans/planning";
import { paddleRequest } from "../../src/server/billing/paddle";

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
        ctx.storage.sql.exec(destinationSearch);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "chatSeq")) ctx.storage.sql.exec(tripChat);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Attachment")').toArray().some(column => column.name === "expenseId")) ctx.storage.sql.exec(expenseReceipts);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "normalAiDates")) ctx.storage.sql.exec(planAccess);
        ctx.storage.sql.exec(tripPurchases);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "selectedPremiumFeatures")) ctx.storage.sql.exec(tripFeatures);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(column => column.name === "onboardingStage")) ctx.storage.sql.exec(guidedSetup);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("TripNotification")').toArray().some(c => c.name === "kind")) ctx.storage.sql.exec(eventAlerts);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("TrialInvitation")').toArray().length) ctx.storage.sql.exec(companyTrials);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("DestinationSearch")').toArray().some(c => c.name === "number")) ctx.storage.sql.exec(destinationSearches);
      });
    });
  }
  async fetch(request: Request) {
    try {
      return await appRuntime.run({ database: this.db, files: this.env.FILES, assets: this.env.ASSETS, authSecret: "test-only-not-used-for-production" }, async () => {
        if (new URL(request.url).pathname === "/count") return Response.json({ users: await this.db.user.count() });
        if (new URL(request.url).pathname === "/billing-request") {
          return appRuntime.run({ database: this.db, authSecret: "isolated-billing-fixture", paddle: { environment: "sandbox", apiKey: "isolated-native-fixture", clientToken: "test_fixture", webhookSecret: "fixture", prices: {}, checkoutEnabled: true } }, async () => {
            const originalFetch = globalThis.fetch;
            let nativeRequests = 0, rejectedRedirects = 0, pinnedHost = true;
            globalThis.fetch = async (input, init) => {
              // Construct a real workerd Request: Node fetch mocks missed its redirect restriction.
              const outgoing = new Request(input, init);
              nativeRequests++;
              pinnedHost &&= new URL(outgoing.url).hostname === "sandbox-api.paddle.com";
              if (outgoing.redirect !== "manual") throw new Error("Billing must not follow redirects");
              return Response.redirect("https://outside.example.test", 302);
            };
            try {
              for (const body of [undefined, { items: [] }]) {
                try { await paddleRequest("/transactions", body); }
                catch (error) { if ((error as { code?: string }).code === "UPSTREAM") rejectedRedirects++; else throw error; }
              }
            } finally { globalThis.fetch = originalFetch; }
            return Response.json({ nativeRequests, rejectedRedirects, pinnedHost });
          });
        }
        if (new URL(request.url).pathname === "/plans") {
          return appRuntime.run({ database: this.db, planAccessEnabled: true, authSecret: "isolated-tier-fixture" }, async () => {
            const id = crypto.randomUUID();
            await this.db.user.create({ data: { id, email: `${id}@example.test`, name: "Tier fixture" } });
            const tripId = await createTrip(id, { name: "Tier fixture", startDate: "2027-05-01", endDate: "2027-05-08", destinations: [{ name: "Lisbon" }], currency: "EUR", timezone: "Europe/Lisbon" });
            const dates = await planningScope(tripId, "full");
            let normalDenied = false;
            try { await getChatPage(id, tripId); } catch (e) { normalDenied = (e as { code?: string }).code === "FORBIDDEN"; }
            await this.db.premiumCheckout.create({ data: { tripId, buyerId: id, environment: "live", priceId: "isolated-fixture", amountMinor: 900, targetCapacity: 2, status: "COMPLETED" } });
            const premiumUnlocked = (await getTripPlan(tripId)).premium && (await getChatPage(id, tripId)).messages.length === 0;
            await this.db.premiumCheckout.updateMany({ where: { tripId }, data: { reviewRequired: true } });
            return Response.json({ normalDenied, aiDates: dates, premiumUnlocked, expiryEnforced: !(await getTripPlan(tripId)).premium });
          });
        }
        if (new URL(request.url).pathname === "/expense-receipt") {
          const fixture = await this.ctx.storage.get<{ userId: string; expenseId: string; receiptId: string }>("expense-receipt-fixture");
          if (!fixture) throw new Error("Missing receipt fixture");
          const file = await readAttachment(fixture.userId, fixture.receiptId);
          return Response.json({ linked: file.meta.expenseId === fixture.expenseId, readable: file.data.toString().includes("private fixture") });
        }
        if (new URL(request.url).pathname === "/feature-selection") {
          const tripId = await this.ctx.storage.get<string>("feature-trip");
          const trip = await this.db.trip.findUniqueOrThrow({ where: { id: tripId! }, select: { selectedPremiumFeatures: true } });
          return Response.json({ features: trip.selectedPremiumFeatures });
        }
        if (new URL(request.url).pathname === "/chat-count") { const chat = await this.ctx.storage.get<{ userId: string; tripId: string }>("chat-fixture"); return Response.json(chat ? { messages: await this.db.chatMessage.count({ where: { tripId: chat.tripId } }), unread: (await getChatSummary(chat.userId, chat.tripId)).unread } : null); }
        const id = crypto.randomUUID();
        const user = await this.db.user.create({ data: { id, email: `${id}@example.test`, name: "Cloudflare fixture" } });
        const tripId = await createTrip(user.id, { name: "Cloudflare migration check", startDate: "2027-05-01", endDate: "2027-05-03", timezone: "Europe/Paris", currency: "EUR", destinations: [{ name: "Paris" }], travelers: [{ name: "Companion", isChild: false }], interests: ["architecture"] });
        await saveTripFeatures(user.id, tripId, ["expenses", "chat"]);
        await this.ctx.storage.put("feature-trip", tripId);
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
        await this.db.stop.createMany({ data: Array.from({ length: 220 }, (_, i) => ({ tripId, dayId: trip.days[0].id, title: `Batch fixture ${i}`, position: i + 10 })) });
        const largeItinerary = await getItinerary(user.id, tripId);
        const expenseStops = await this.db.stop.findMany({ where: { tripId, dayId: { not: null } }, select: { id: true, day: { select: { activePlan: true } } } });
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
          largeRelationQueries: largeItinerary.days.flatMap(day => day.stops).filter(stop => stop.title.startsWith("Batch fixture ")).length === 220 && expenseStops.length >= 220,
          pdfHeader: pdf.subarray(0, 4).toString(),
          users: await this.db.user.count(),
        });
      });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 }); }
  }
}
export default { fetch(request: Request, env: Env) { return env.PROBE.getByName("fixture").fetch(request); } };

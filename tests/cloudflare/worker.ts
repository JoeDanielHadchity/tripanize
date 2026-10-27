import automaticTripCovers from "../../prisma/migrations/202610260021_automatic_trip_covers/migration.sql";
import { readMealOptions, MEALS, type DayMeals } from "../../src/lib/meal-options";
import mealOptions from "../../prisma/migrations/202610260020_meal_options/migration.sql";
import adminEmailCode from "../../prisma/migrations/202610240019_admin_email_code/migration.sql";
import adminAuthentication from "../../prisma/migrations/202610230018_admin_authentication/migration.sql";
import { executeAdminSecurity, adminSecurityStatus } from "../../src/server/admin/security";
import { auth } from "../../src/server/auth/auth";
import { resolveAccountMode, sessionAccountMode, setAccountMode } from "../../src/server/admin/mode";
import adminNormalMode from "../../prisma/migrations/202610230017_admin_normal_mode/migration.sql";
import { createPoll, castVote, decidePoll, listPolls } from "../../src/server/voting/service";
import { queueDueBookingReminders, nextBookingReminderAt } from "../../src/server/bookings/reminders";
import { scanExpenseReceipt } from "../../src/server/expenses/scan";
import type { generateStructured } from "../../src/server/ai/openai";
import remindersVotes from "../../prisma/migrations/202610230016_reminders_votes/migration.sql";
import { requireTrip } from "../../src/server/auth/permissions";
import { executeAdminCommand, adminOverview, adminUsers, adminTrips, adminAi, adminSupport, adminPayments, adminHealth, adminActivity, activeAnnouncements, adminAnnouncements } from "../../src/server/admin/operations";
import { reserveAiUsage, captureAiUsage, finishAiUsage } from "../../src/server/admin/ai-usage";
import adminDashboard from "../../prisma/migrations/202610230015_admin_dashboard/migration.sql";
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
import { appRuntime, currentRuntime } from "../../src/server/cloudflare/runtime";
import { destinationImageKey, getTripCover } from "../../src/server/images";
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
import { normalizeCompanyIdentity } from "../../src/server/admin/identity";
import { copyExample } from "../../src/server/examples/copy";
import { CITY_GUIDES } from "../../src/server/examples/city-guides";

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
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("user")').toArray().some(c => c.name === "suspendedAt")) ctx.storage.sql.exec(adminDashboard);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Booking")').toArray().some(c => c.name === "bookByAt")) ctx.storage.sql.exec(remindersVotes);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("session")').toArray().some(c => c.name === "normalMode")) ctx.storage.sql.exec(adminNormalMode);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("session")').toArray().some(c => c.name === "adminVerifiedUntil")) ctx.storage.sql.exec(adminAuthentication);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("session")').toArray().some(c => c.name === "adminEmailUnlockedAt")) ctx.storage.sql.exec(adminEmailCode);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("ItineraryDay")').toArray().some(c => c.name === "mealOptions")) ctx.storage.sql.exec(mealOptions);
        if (!ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info("Trip")').toArray().some(c => c.name === "imageDestinationKey")) ctx.storage.sql.exec(automaticTripCovers);
      });
    });
  }
  async fetch(request: Request) {
    try {
      return await appRuntime.run({ database: this.db, files: this.env.FILES, assets: this.env.ASSETS, authSecret: "test-only-not-used-for-production" }, async () => {
        if (new URL(request.url).pathname === "/city-guide-copy") {
          const ownerId = crypto.randomUUID();
          await this.db.user.create({ data: { id: ownerId, name: "Guide copy fixture", email: `${ownerId}@example.test` } });
          for (const slug of ["bangkok", "london"]) {
            const guide = CITY_GUIDES.find(city => city.slug === slug)!;
            const id = await copyExample(ownerId, slug, "2030-07-10");
            const trip = await this.db.trip.findUniqueOrThrow({ where: { id }, include: { days: { include: { stops: true } }, bookings: true } });
            if (trip.timezone !== guide.timezone || trip.currency !== guide.currency || trip.budgetMinor !== null || trip.ownerId !== ownerId) throw new Error("Copied guide has incorrect trip settings");
            if (trip.days.length !== 4 || trip.days.flatMap(day => day.stops).length !== guide.days.flatMap(day => day.stops).length) throw new Error("Guide copy lost itinerary stops");
            if (trip.days.flatMap(day => day.stops).some(stop => stop.origin !== "MANUAL" || stop.estCostMinor !== null || stop.bookingId !== null)) throw new Error("Guide copy duplicated or charged itinerary stops");
            if (trip.bookings.some(booking => booking.status !== "IDEA" || booking.date !== null || booking.estCostMinor !== null)) throw new Error("Guide ideas became confirmed bookings");
          }
          return Response.json({ copied: 2, days: 8, privateCopies: true, perPersonBudgetNotApplied: true, bookingsUnconfirmed: true });
        }
        if (new URL(request.url).pathname === "/admin-check") {
          const adminEmail = `native-admin-${crypto.randomUUID()}@example.test`;
          const admin = await this.db.user.create({ data: { id: crypto.randomUUID(), name: "Administrator", email: adminEmail, emailVerified: true } });
          const traveler = await this.db.user.create({ data: { id: crypto.randomUUID(), name: "Native traveler", email: `native-${crypto.randomUUID()}@example.test`, emailVerified: true } });
          const adminSession = await this.db.session.create({ data: { id: crypto.randomUUID(), token: crypto.randomUUID(), userId: admin.id, expiresAt: new Date(Date.now() + 86400_000), adminEmailUnlockedAt: new Date(), adminVerifiedUntil: new Date(Date.now() + 30 * 60_000) } });
          return appRuntime.run({ database: this.db, authSecret: "isolated-admin-fixture", companyAdminEmail: adminEmail, planAccessEnabled: true, accountMode: { userId: admin.id, sessionId: adminSession.id, normal: false } }, async () => {
            let guard = false;
            try { await adminOverview(traveler.id); } catch (e) { guard = (e as { code?: string }).code === "FORBIDDEN"; }
            const checkName = `Native administration check ${crypto.randomUUID()}`;
            const tripId = await createTrip(traveler.id, { name: checkName });
            const users = await adminUsers(admin.id, traveler.email, 0);
            const trips = await adminTrips(admin.id, checkName, 0);
            await executeAdminCommand(admin.id, { op: "user.suspend", id: traveler.id, suspended: true, reason: "Native access check" });
            let suspended = false;
            try { await requireTrip(tripId, traveler.id); } catch (e) { suspended = (e as { code?: string }).code === "NOT_FOUND"; }
            await executeAdminCommand(admin.id, { op: "user.suspend", id: traveler.id, suspended: false, reason: "" });
            await executeAdminCommand(admin.id, { op: "announcement.create", title: "Native fixture", message: "Plain text", tone: "info", startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: null });
            const a = (await adminAnnouncements(admin.id))[0];
            await executeAdminCommand(admin.id, { op: "announcement.status", id: a.id, version: 1, status: "PUBLISHED" });
            const published = (await activeAnnouncements()).some(r => r.id === a.id);
            await executeAdminCommand(admin.id, { op: "announcement.status", id: a.id, version: 2, status: "ARCHIVED" });
            await executeAdminCommand(admin.id, { op: "ai.settings", aiPaused: false, aiDailyLimit: null, aiUserDailyLimit: null, pricingModel: "native-model", inputUsdPerMillion: 1, outputUsdPerMillion: 2, searchUsdPerThousand: 3 });
            const usage = await reserveAiUsage("fixture", "native-model", { userId: traveler.id, tripId });
            await captureAiUsage(usage.id, { model: "native-model", usage: { input_tokens: 100, output_tokens: 100 }, output: [] });
            await finishAiUsage(usage.id, "SUCCEEDED");
            await this.db.supportRequest.create({ data: { requestKey: crypto.randomUUID(), reference: crypto.randomUUID(), name: "Fixture", email: traveler.email, topic: "general", message: "Native support fixture" } });
            const overview = await adminOverview(admin.id), ai = await adminAi(admin.id), support = await adminSupport(admin.id, 0), payments = await adminPayments(admin.id, 0), health = await adminHealth(admin.id), audit = await adminActivity(admin.id, 0);
            return Response.json({ guard, suspended, restored: (await requireTrip(tripId, traveler.id)).role === "OWNER", users: users.total === 1, trips: trips.total === 1, announcements: published, usage: ai.rows.some(r => r.id === usage.id && r.estimatedCostMicros === 300), support: support.total > 0, payments: Array.isArray(payments.rows), health: Array.isArray(health.webhooks), audit: audit.total >= 5, overview: overview.users >= 2 });
          });
        }
        if (new URL(request.url).pathname === "/mode-check") {
          const email = `mode-${crypto.randomUUID()}@example.test`, origin = new URL(request.url).origin;
          const modeRuntime = { database: this.db, authSecret: "isolated-mode-fixture", companyAdminEmail: email, planAccessEnabled: true, appUrl: origin };
          return appRuntime.run(modeRuntime, async () => {
            const signed = await auth.handler(new Request(`${origin}/api/auth/sign-up/email`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Native mode fixture", email, password: crypto.randomUUID() + "Aa1!" }) }));
            if (!signed.ok) throw new Error(`Native fixture sign-in failed (${signed.status})`);
            const body = await signed.json() as { user: { id: string } };
            const cookie = signed.headers.getSetCookie().map(s => s.split(";")[0]).join("; ");
            const headers = new Headers({ Cookie: cookie, Origin: origin });
            const hiddenBeforeVerification = !await resolveAccountMode(headers);
            await this.db.user.update({ where: { id: body.user.id }, data: { emailVerified: true } });
            const initial = await resolveAccountMode(headers);
            if (!initial?.sessionId) throw new Error("Native mode session missing");
            let emailed = "";
            const deliver = async (message: { to: string; text: string }) => {
              if (message.to !== email) throw new Error("Admin code recipient mismatch");
              emailed = message.text.match(/\b\d{6}\b/)![0];
              return { status: "sent" as const, providerId: "native-admin-email-fixture" };
            };
            const sent = await appRuntime.run({ ...modeRuntime, accountMode: initial }, () => executeAdminSecurity(body.user.id, { op: "send-code" }, deliver));
            const firstCode = emailed;
            const savedHash = (await this.db.adminEmailChallenge.findUniqueOrThrow({ where: { userId: body.user.id } })).codeHash;
            const codeHashOnly = Boolean(savedHash && savedHash !== firstCode && !JSON.stringify(sent).includes(firstCode));
            await appRuntime.run({ ...modeRuntime, accountMode: initial }, () => executeAdminSecurity(body.user.id, { op: "unlock", code: firstCode }));
            const tripId = await createTrip(body.user.id, { name: "Native mode fixture", startDate: "2027-05-01", endDate: "2027-05-04", timezone: "UTC" });
            const message = await sendChatMessage(body.user.id, tripId, { clientId: crypto.randomUUID(), body: "Keep this message" });
            const identityAudit = await this.db.auditLog.findFirstOrThrow({ where: { tripId, entity: "trip" } });
            await this.db.user.update({ where: { id: body.user.id }, data: { name: "Tripanize.app" } });
            await this.db.traveler.updateMany({ where: { tripId, userId: body.user.id }, data: { name: "Tripanize.app" } });
            await this.db.chatMessage.update({ where: { id: message.id }, data: { senderName: "Tripanize.app" } });
            await this.db.auditLog.update({ where: { id: identityAudit.id }, data: { actorName: "Tripanize.app" } });
            const notice = await this.db.tripNotification.create({ data: { userId: body.user.id, tripId, auditId: identityAudit.id, tripName: "Native mode fixture", summary: "Tripanize.app updated trip details.", href: "/trips" } });
            await normalizeCompanyIdentity();
            const personalIdentity = (await this.db.user.findUniqueOrThrow({ where: { id: body.user.id } })).name === "Joe Daniel Hadchity"
              && (await this.db.traveler.findFirstOrThrow({ where: { tripId, userId: body.user.id } })).name === "Joe Daniel Hadchity"
              && (await this.db.chatMessage.findUniqueOrThrow({ where: { id: message.id } })).senderName === "Joe Daniel Hadchity"
              && (await this.db.tripNotification.findUniqueOrThrow({ where: { id: notice.id } })).summary === "Joe Daniel Hadchity updated trip details.";
            await appRuntime.run({ ...modeRuntime, accountMode: initial }, () => setAccountMode(body.user.id, "NORMAL"));
            const normal = await resolveAccountMode(headers);
            let denied = false, premiumRetained = false;
            await appRuntime.run({ ...modeRuntime, accountMode: normal }, async () => {
              try { await adminOverview(body.user.id); } catch (e) { denied = (e as { code?: string }).code === "FORBIDDEN"; }
              premiumRetained = (await getTripPlan(tripId)).source === "company" && await planningScope(tripId, "full") === null;
            });
            const othersUnchanged = (await getTripPlan(tripId)).premium;
            let requiresCode = false;
            try { await appRuntime.run({ ...modeRuntime, accountMode: normal }, () => setAccountMode(body.user.id, "ADMIN")); } catch (e) { requiresCode = (e as { code?: string }).code === "FORBIDDEN"; }
            let replayDenied = false;
            try { await appRuntime.run({ ...modeRuntime, accountMode: normal }, () => executeAdminSecurity(body.user.id, { op: "unlock", code: firstCode })); } catch { replayDenied = true; }
            await this.db.adminEmailChallenge.update({ where: { userId: body.user.id }, data: { requestedAt: new Date(Date.now() - 61_000) } });
            await appRuntime.run({ ...modeRuntime, accountMode: normal }, () => executeAdminSecurity(body.user.id, { op: "send-code" }, deliver));
            await appRuntime.run({ ...modeRuntime, accountMode: normal }, () => executeAdminSecurity(body.user.id, { op: "unlock", code: emailed }));
            const restored = !(await resolveAccountMode(headers))?.normal;
            const factorConfirmed = await appRuntime.run({ ...modeRuntime, accountMode: await resolveAccountMode(headers) }, async () => (await adminSecurityStatus(body.user.id)).unlocked);
            await appRuntime.run({ ...modeRuntime, accountMode: await resolveAccountMode(headers) }, () => setAccountMode(body.user.id, "NORMAL"));
            await this.ctx.storage.put("modeFixture", { email, userId: body.user.id, sessionId: initial.sessionId, tripId });
            return Response.json({ personalIdentity, hiddenBeforeVerification, denied, premiumRetained, othersUnchanged, restored, requiresCode, factorConfirmed, codeHashOnly, replayDenied, defaultsAdmin: initial.normal === false, forgedCookieIgnored: !await resolveAccountMode(new Headers({ Cookie: "tripanize.mode=ADMIN; better-auth.session_token=fake" })) });
          });
        }
        if (new URL(request.url).pathname === "/mode-state") {
          const state = await this.ctx.storage.get<{ email: string; userId: string; sessionId: string; tripId: string }>("modeFixture");
          if (!state) throw new Error("Mode fixture missing");
          return appRuntime.run({ database: this.db, authSecret: "isolated-mode-fixture", companyAdminEmail: state.email, planAccessEnabled: true }, async () => Response.json({ persisted: (await sessionAccountMode(state.userId, state.sessionId))?.normal === true && (await this.db.user.findUniqueOrThrow({ where: { id: state.userId } })).name === "Joe Daniel Hadchity" && (await this.db.traveler.findFirstOrThrow({ where: { tripId: state.tripId, userId: state.userId } })).name === "Joe Daniel Hadchity" }));
        }
        if (new URL(request.url).pathname === "/travel-tools") {
          const user = await this.db.user.create({ data: { id: crypto.randomUUID(), name: "Native trip tools", email: `tools-${crypto.randomUUID()}@example.test` } });
          const tripId = await createTrip(user.id, { name: "Native travel tools", timezone: "UTC" });
          const deadline = new Date(Date.now() + 12 * 3600_000).toISOString().slice(0, 16);
          const booking = await createBooking(user.id, tripId, { title: "Native booking deadline", category: "ATTRACTION", status: "TO_BOOK", currency: "EUR", bookByAt: deadline });
          const queued = await queueDueBookingReminders();
          const noRepeat = await queueDueBookingReminders() === 0;
          const reminders = await this.db.tripNotification.count({ where: { tripId, kind: "booking_reminder" } });
          const next = await nextBookingReminderAt();
          const poll = await createPoll(user.id, tripId, { question: "Which activity?", kind: "ACTIVITY", options: ["Museum", "Walk"] });
          const p = (await listPolls(user.id, tripId)).polls[0];
          await castVote(user.id, tripId, poll.id, p.options[1].id, p.version);
          await decidePoll(user.id, tripId, poll.id, "DECIDE", p.options[1].id, "Native fixture", p.version);
          const decided = (await listPolls(user.id, tripId)).polls[0];
          const mockGenerate = (async () => ({ data: { readable: true, merchant: "Native Cafe", amount: "12.50", currency: "EUR", date: "2027-05-01", category: "Food & drink", uncertain: false }, model: "fixture", sources: [], usage: null })) as unknown as typeof generateStructured;
          const scan = await scanExpenseReceipt(user.id, tripId, new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "receipt.jpg", { type: "image/jpeg" }), mockGenerate);
          await this.ctx.storage.put("travelTools", { tripId, userId: user.id, bookingId: booking.id, pollId: poll.id });
          return Response.json({ reminders: queued > 0 && reminders === 1 && noRepeat && next !== null, votes: decided.status === "DECIDED" && decided.totalVotes === 1, scan: scan.amount === "12.50" && await this.db.expense.count({ where: { tripId } }) === 0 });
        }
        if (new URL(request.url).pathname === "/travel-tools-state") {
          const state = await this.ctx.storage.get<{ tripId: string; userId: string; bookingId: string; pollId: string }>("travelTools");
          if (!state) throw new Error("Native travel tools fixture missing");
          const p = (await listPolls(state.userId, state.tripId)).polls[0];
          return Response.json({ reminders: await this.db.tripNotification.count({ where: { tripId: state.tripId, kind: "booking_reminder" } }) === 1, votes: p.status === "DECIDED" && p.totalVotes === 1, booking: Boolean((await this.db.booking.findUnique({ where: { id: state.bookingId } }))?.bookByAt) });
        }
        if (new URL(request.url).pathname === "/trip-cover") {
          const saved = await this.ctx.storage.get<{ tripId: string; userId: string; updatedAt: string }>("automaticCover");
          if (saved) {
            const result = await getTripCover(saved.userId, saved.tripId);
            const trip = await this.db.trip.findUniqueOrThrow({ where: { id: saved.tripId } });
            return Response.json({ persisted: result.image?.url === "https://upload.wikimedia.org/automatic-1920.jpg" && trip.updatedAt.toISOString() === saved.updatedAt });
          }
          const userId = crypto.randomUUID();
          await this.db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "Automatic cover fixture" } });
          const key = destinationImageKey("Native City", "Fixture country");
          const value = { image: { url: "https://upload.wikimedia.org/automatic-1920.jpg", credit: "Fixture photographer · CC BY-SA 4.0", pageUrl: "https://commons.wikimedia.org/wiki/File:automatic.jpg" } };
          await this.db.externalCache.upsert({ where: { key }, create: { key, value }, update: { value, fetchedAt: new Date() } });
          const tasks: (() => Promise<void>)[] = [];
          const tripId = await appRuntime.run({ ...currentRuntime(), background: run => tasks.push(run) }, () => createTrip(userId, { name: "Automatic cover fixture", destinations: [{ name: "Native City", country: "Fixture country" }] }));
          const before = await this.db.trip.findUniqueOrThrow({ where: { id: tripId } });
          if (tasks.length !== 1) throw new Error("Trip creation did not schedule its cover");
          await tasks[0]();
          const trip = await this.db.trip.findUniqueOrThrow({ where: { id: tripId } });
          await this.db.externalCache.delete({ where: { key } });
          await this.ctx.storage.put("automaticCover", { tripId, userId, updatedAt: before.updatedAt.toISOString() });
          return Response.json({ persisted: trip.imageUrl === value.image.url && trip.imageDestinationKey === key && trip.updatedAt.getTime() === before.updatedAt.getTime() });
        }
        if (new URL(request.url).pathname === "/meal-options") {
          const savedId = await this.ctx.storage.get<string>("mealOptionsDay");
          if (savedId) {
            const saved = await this.db.itineraryDay.findUniqueOrThrow({ where: { id: savedId } });
            return Response.json({ persisted: MEALS.every(meal => readMealOptions(saved.mealOptions)[meal].length === 2) });
          }
          const ownerId = crypto.randomUUID();
          await this.db.user.create({ data: { id: ownerId, email: `${ownerId}@example.test`, name: "Dining fixture" } });
          const tripId = await createTrip(ownerId, { name: "Dining fixture", startDate: "2027-05-01", endDate: "2027-05-01", destinations: [{ name: "Lisbon" }], currency: "EUR", timezone: "Europe/Lisbon" });
          const day = await this.db.itineraryDay.findFirstOrThrow({ where: { tripId } });
          const meals = Object.fromEntries(MEALS.map(meal => [meal, [1, 2].map(n => ({ name: `${meal} ${n}`, cuisine: "Local", area: "Old town", address: null, whyFits: "Near the route", pricePerPerson: 15, officialUrl: "https://restaurant.example/menu", sourceUrls: ["https://restaurant.example/menu"], hoursNote: null }))])) as DayMeals;
          await this.db.itineraryDay.update({ where: { id: day.id }, data: { mealOptions: meals } });
          await this.ctx.storage.put("mealOptionsDay", day.id);
          return Response.json({ persisted: MEALS.every(meal => readMealOptions(meals)[meal].length === 2) });
        }
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

import { z } from "zod";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { prisma } from "@/server/db";
import { getMobileUser } from "./service";
import { tripInput } from "@/server/trips/schemas";
import * as trips from "@/server/trips/service";
import * as onboarding from "@/server/trips/onboarding";
import * as itinerary from "@/server/itinerary/service";
import * as bookings from "@/server/bookings/service";
import * as expenses from "@/server/expenses/service";
import * as packing from "@/server/packing/service";
import * as tasks from "@/server/trips/tasks";
import * as events from "@/server/events/service";
import * as invites from "@/server/invitations/service";
import * as discovery from "@/server/destinations/service";
import * as votes from "@/server/voting/service";
import * as jobs from "@/server/planner/jobs";
import { applyProposal } from "@/server/planner/apply";
import { savePlanPrefs } from "@/server/planner/questions";
import { requestDiscovery } from "@/server/events/discovery";
import { chatCommand, sendChatMessage, markChatRead, deleteChatMessage } from "@/server/chat/service";
import { assistantCommand } from "@/server/assistant/schema";
import { sendAssistantMessage, applyAssistantChanges, dismissAssistantProposal, cancelAssistantReply } from "@/server/assistant/service";
import { changeMemberLocation } from "@/server/locations/service";
import { profileInput, updateProfile, updateNotificationPrefs } from "@/server/profile";
import { markChangeNotificationsRead, setChangeEmailPreference } from "@/server/notifications/changes";
import { setBookingReminderPreference } from "@/server/bookings/reminders";
import { deleteAttachment } from "@/server/storage";
import { adminSecurityCommand, executeAdminSecurity } from "@/server/admin/security";
import { adminCommand, executeAdminCommand } from "@/server/admin/operations";
import { createTrialInvitation, revokeTrialInvitation, acceptTrialInvitation } from "@/server/admin/trials";
import { setAccountMode } from "@/server/admin/mode";
import { getTripPlan } from "@/server/plans/access";
import { ensureDestinationCoords } from "@/server/weather/trip";
import { SwapSchema } from "@/server/planner/schema";
import { submitSupport } from "@/server/support/service";
import { deleteMobileAccount } from "./delete-account";
import type { MobileCommandResult } from "@/lib/mobile-workspace";
import type { Impact } from "@/server/itinerary/schedule";
import { wire } from "./presentation";

const id = z.string().min(1).max(80), version = z.number().int().nonnegative();
const maybeText = z.string().max(2000).nullable().optional();
const answers = z.object({ answers: z.array(z.object({ q: z.string().max(500), a: z.array(z.string().max(300)).max(30) })).max(40), note: maybeText, foodNotes: maybeText });
const edit = z.object({ id, version });
const rawCommand = z.object({ action: z.string().min(1).max(64), tripId: id.optional(), values: z.record(z.string(), z.unknown()).default({}) }).strict();
const done: MobileCommandResult = { refresh: true };

/** Explicit operation allowlist. Each service repeats its own role, entitlement,
 * entity ownership, concurrency and audit checks. UI metadata confers no rights. */
export async function mobileCommand(userId: string, raw: unknown, sessionId?: string): Promise<MobileCommandResult> {
  await getMobileUser(userId);
  const c = rawCommand.parse(raw), v = c.values;
  const parse = <S extends z.ZodType>(schema: S) => schema.parse(v);
  const tripId = c.tripId ?? "";
  if (c.tripId) await requireTrip(tripId, userId);
  const to = (screen: string, item?: string): MobileCommandResult => ({ to: { screen, ...(tripId ? { tripId } : {}), ...(item ? { item } : {}) } });
  const review = (title: string, lines: string[]): MobileCommandResult => ({ review: { title, lines, action: c.action, values: { ...wire(v) as import("@/lib/mobile-workspace").MobileValues, reviewed: true } } });
  const impactLines = (i: Impact | null) => i ? [...i.conflicts.map(c => c.message), ...i.moved.map(m => `${m.title}: ${m.from ?? "Unscheduled"} → ${m.to ?? "Unscheduled"}`), ...i.bookingsAffected.map(b => `Booking affected: ${b.title}`)] : [];
  switch (c.action) {
    case "trip.create": {
      const d = parse(z.object({ name: z.string().trim().min(1).max(120) }));
      const result = await onboarding.createTripDraft(userId, d.name);
      return { to: { screen: "setup", tripId: result.id } };
    }
    case "trip.standard": await onboarding.chooseNormal(userId, tripId); return to("setup");
    case "trip.details": case "trip.update": {
      const { version: ver } = parse(z.object({ version })); const input = tripInput.parse(v);
      if (c.action === "trip.update" && v.reviewed !== true) {
        const p = await trips.previewTripChange(userId, tripId, input);
        const lines = [...p.removedDays.map(d => `${d.date}: ${d.stops} stops will become unscheduled ideas.`), ...p.changedDays.map(d => `${d.date}: ${d.from ?? "No destination"} → ${d.to ?? "No destination"}`), ...p.bookingsOutside.map(b => `${b.title}: booking falls outside the new trip dates (${b.date}).`)];
        if (lines.length) return review("Review your trip changes", lines);
      }
      if (c.action === "trip.details") await onboarding.saveOnboardingDetails(userId, tripId, input, ver);
      else await trips.updateTrip(userId, tripId, input, ver);
      const dests = await Promise.race([ensureDestinationCoords(tripId).catch(() => null), new Promise<null>(resolve => setTimeout(() => resolve(null), 3000))]);
      const tz = dests?.find(d => d.timezone)?.timezone;
      if (tz && !input.timezone) await prisma.trip.update({ where: { id: tripId }, data: { timezone: tz } });
      return to(c.action === "trip.details" ? "setup" : "settings");
    }
    case "trip.delete": await trips.deleteTrip(userId, tripId, parse(z.object({ name: z.string() })).name); return { to: { screen: "trips" } };
    case "setup.generate": { const a = answers.parse(v); await onboarding.startOnboardingPlan(userId, tripId, { ...a, note: a.note ?? null }); return done; }
    case "setup.retry": await onboarding.retryOnboarding(userId, tripId); return done;
    case "setup.manual": {
      await requireTrip(tripId, userId, "manage");
      const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
      if (trip.onboardingStage !== "QUESTIONS") throw new AppError("CONFLICT", "Save your trip details first.");
      await prisma.trip.update({ where: { id: tripId }, data: { onboardingStage: "COMPLETE" } }); return to("itinerary");
    }
    case "stop.save": {
      const d = parse(z.object({ id: id.nullable().optional(), dayId: id.nullable(), plan: z.enum(["A", "B"]), version: version.default(0), confirm: z.boolean().default(false) }));
      const input = itinerary.stopFields.parse(v);
      if (d.id) {
        if (v.reviewed !== true) { const p = await itinerary.updateStop(userId, tripId, d.id, input, { version: d.version, dryRun: true }); if (p.impact?.material || p.impact?.conflicts.length) return review("Review the schedule impact", impactLines(p.impact)); }
        await itinerary.updateStop(userId, tripId, d.id, input, { version: d.version, confirm: d.confirm });
      }
      else await itinerary.addStop(userId, tripId, { dayId: d.dayId, plan: d.plan, input });
      return to("itinerary", d.dayId ?? undefined);
    }
    case "stop.status": { const d = parse(edit.extend({ status: z.enum(["PLANNED", "SUGGESTED", "SKIPPED"]) })); await itinerary.setStopStatus(userId, tripId, d.id, d.status, d.version); return done; }
    case "stop.delete": { const d = parse(z.object({ id, confirm: z.boolean().default(false) })); await itinerary.deleteStop(userId, tripId, d.id, { confirm: d.confirm }); return to("itinerary"); }
    case "stop.move": { const d = parse(edit.extend({ dayId: id.nullable(), plan: z.enum(["A", "B"]), confirm: z.boolean().default(false) })); if (v.reviewed !== true) { const p = await itinerary.moveStop(userId, tripId, d.id, { dayId: d.dayId, plan: d.plan }, { version: d.version, dryRun: true }); if (p.impacts.some(i => i.impact.material || i.impact.conflicts.length)) return review("Review the move", p.impacts.flatMap(i => [i.label, ...impactLines(i.impact)])); } await itinerary.moveStop(userId, tripId, d.id, { dayId: d.dayId, plan: d.plan }, { version: d.version, confirm: d.confirm }); return to("itinerary", d.dayId ?? undefined); }
    case "stop.reorder": { const d = parse(z.object({ dayId: id, plan: z.enum(["A", "B"]), ids: z.array(id).max(200) })); if (v.reviewed !== true) { const p = await itinerary.reorderStops(userId, tripId, d.dayId, d.plan, d.ids, { dryRun: true }); if (p.impact.material || p.impact.conflicts.length) return review("Review the new order", impactLines(p.impact)); } await itinerary.reorderStops(userId, tripId, d.dayId, d.plan, d.ids); return done; }
    case "day.plan": { const d = parse(z.object({ id, plan: z.enum(["A", "B"]) })); await itinerary.setActivePlan(userId, tripId, d.id, d.plan); return done; }
    case "day.save": { const d = parse(edit.extend({ title: maybeText, notes: maybeText, planBNote: maybeText })); await itinerary.updateDay(userId, tripId, d.id, { title: d.title, notes: d.notes, planBNote: d.planBNote }, d.version); return to("itinerary", d.id); }
    case "version.restore": await itinerary.restoreVersion(userId, tripId, parse(z.object({ id })).id); return to("itinerary");
    case "plan.preferences": { const d = answers.parse(v); await savePlanPrefs(userId, tripId, { ...d, note: d.note ?? null }); return to("plan"); }
    case "plan.start": { const d = parse(z.object({ kind: z.enum(["full", "days", "swap"]), dates: z.array(z.string().max(10)).max(120).optional(), stopId: id.optional(), instruction: z.string().max(500).nullable().optional() })); const r = await jobs.enqueueJob(userId, tripId, d.kind, d); return to("job", r.jobId); }
    case "plan.cancel": await jobs.cancelJob(userId, tripId, parse(z.object({ id })).id); return done;
    case "plan.apply": { const d = parse(z.object({ id, dates: z.array(z.string().max(10)).max(120) })); await applyProposal(userId, tripId, d.id, d.dates); return to("itinerary"); }
    case "plan.swap": {
      const d = parse(z.object({ id, index: z.number().int().min(0).max(3), version }));
      const job = await jobs.getJob(userId, tripId, d.id);
      if (job.kind !== "swap" || job.status !== "SUCCEEDED") throw new AppError("CONFLICT", "This alternative is not ready.");
      const proposal = SwapSchema.parse(job.proposal), s = proposal.alternatives[d.index];
      const params = z.object({ stopId: id }).parse(job.params);
      if (!s) throw new AppError("NOT_FOUND", "Alternative not found.");
      await itinerary.replaceStop(userId, tripId, params.stopId, { ...s, estCost: s.estCost === null ? null : String(s.estCost) }, { version: d.version, origin: "AI" });
      return to("itinerary");
    }
    case "booking.save": {
      const d = parse(z.object({ id: id.nullable().optional(), version: version.default(0), eventId: id.nullable().optional() }));
      const input = { ...bookings.bookingInput.parse(v), eventId: d.eventId };
      if (d.id) await bookings.updateBooking(userId, tripId, d.id, input, d.version); else await bookings.createBooking(userId, tripId, input);
      return to("bookings");
    }
    case "booking.status": { const d = parse(edit.extend({ status: z.enum(["IDEA", "TO_BOOK", "REQUESTED", "BOOKED", "PAID", "CANCELLED"]) })); await bookings.setBookingStatus(userId, tripId, d.id, d.status, d.version); return done; }
    case "booking.delete": await bookings.deleteBooking(userId, tripId, parse(z.object({ id })).id); return to("bookings");
    case "attachment.delete": await deleteAttachment(userId, tripId, parse(z.object({ id })).id); return done;
    case "expense.save": {
      const d = parse(z.object({ id: id.nullable().optional(), version: version.default(0) })), input = expenses.expenseInput.parse(v);
      if (d.id) await expenses.updateExpense(userId, tripId, d.id, input, d.version); else await expenses.createExpense(userId, tripId, input);
      return to("expenses");
    }
    case "expense.delete": await expenses.deleteExpense(userId, tripId, parse(z.object({ id })).id); return to("expenses");
    case "settlement.save": { const d = parse(z.object({ fromId: id, toId: id, amount: z.string().max(30), currency: z.string().length(3), paidAt: z.string().max(40), note: maybeText })); await expenses.recordSettlement(userId, tripId, d); return to("expenses"); }
    case "settlement.delete": await expenses.deleteSettlement(userId, tripId, parse(z.object({ id })).id); return done;
    case "packing.add": { const d = parse(z.object({ label: z.string().min(1).max(160), category: z.string().max(60), quantity: z.number().int().min(1).max(999), shared: z.boolean() })); await packing.addPackingItem(userId, tripId, d); return done; }
    case "packing.update": { const d = parse(edit.extend({ label: z.string().max(160).optional(), category: z.string().max(60).optional(), quantity: z.number().int().min(1).max(999).optional(), packed: z.boolean().optional() })); await packing.updatePackingItem(userId, tripId, d.id, d, d.version); return done; }
    case "packing.remove": await packing.removePackingItem(userId, tripId, parse(z.object({ id })).id); return done;
    case "packing.generate": await packing.refreshSuggestions(userId, tripId, { laundry: parse(z.object({ laundry: z.boolean().nullable() })).laundry, personalized: true }); return done;
    case "task.add": { const d = parse(z.object({ title: z.string().max(160), dueDate: z.string().max(10).nullable().optional(), assigneeId: id.nullable().optional() })); await tasks.addTask(userId, tripId, d); return done; }
    case "task.toggle": { const d = parse(edit.extend({ done: z.boolean() })); await tasks.toggleTask(userId, tripId, d.id, d.done, d.version); return done; }
    case "task.delete": await tasks.deleteTask(userId, tripId, parse(z.object({ id })).id); return done;
    case "events.discover": await requestDiscovery(userId, tripId); return done;
    case "event.add": { const d = parse(z.object({ title: z.string().max(160), category: z.string().max(60).optional(), date: maybeText, startTime: maybeText, venue: maybeText, city: maybeText, officialUrl: maybeText, bookingUrl: maybeText, priceText: maybeText, notes: maybeText })); await events.addCustomEvent(userId, tripId, d); return to("events"); }
    case "event.status": { const d = parse(z.object({ id, status: z.enum(["NEW", "SAVED", "HIDDEN", "SCHEDULED"]), expectedStatus: z.enum(["NEW", "SAVED", "HIDDEN", "SCHEDULED"]).optional() })); await events.setEventStatus(userId, tripId, d.id, d.status, d.expectedStatus); return done; }
    case "event.schedule": { const d = parse(z.object({ id, dayId: id, startTime: z.string().max(5).nullable(), durationMin: z.number().int().min(5).max(1440) })); await events.scheduleEvent(userId, tripId, d.id, d.dayId, d.startTime, d.durationMin); return to("events"); }
    case "event.ack": await events.acknowledgeEventChanges(userId, tripId, parse(z.object({ id })).id); return done;
    case "events.settings": { const d = parse(z.object({ autoDiscovery: z.boolean() })); await events.updateDiscoverySettings(userId, tripId, d); return done; }
    case "events.alerts": { const d = parse(z.object({ emailEnabled: z.boolean(), frequency: z.enum(["daily", "immediate"]), changeTypes: z.array(z.string().max(40)).max(10) })); await updateNotificationPrefs(userId, tripId, d); return done; }
    case "chat": { const d = chatCommand.parse(v); if (d.op === "send") await sendChatMessage(userId, tripId, d); else if (d.op === "delete") await deleteChatMessage(userId, tripId, d.id); else await markChatRead(userId, tripId, d.seq); return done; }
    case "assistant": { const d = assistantCommand.parse(v); if (d.op === "send") await sendAssistantMessage(userId, tripId, d); else if (d.op === "apply") await applyAssistantChanges(userId, tripId, d.id); else if (d.op === "dismiss") await dismissAssistantProposal(userId, tripId, d.id); else await cancelAssistantReply(userId, tripId, d.id); return done; }
    case "location": await changeMemberLocation(userId, tripId, v); return done;
    case "invite.create": { const d = parse(z.object({ role: z.enum(["COLLABORATOR", "VIEWER"]), email: z.string().max(254).nullable().optional(), travelerId: id.nullable().optional() })); const r = await invites.createInvitation(userId, tripId, d); return { message: "Invitation created.", url: r.url, refresh: true }; }
    case "invite.revoke": await invites.revokeInvitation(userId, tripId, parse(z.object({ id })).id); return done;
    case "invite.accept": { const r = await invites.acceptInvitationById(userId, parse(z.object({ id })).id); return { to: { screen: "itinerary", tripId: r.tripId } }; }
    case "invite.token": { let token = parse(z.object({ token: z.string().trim().min(20).max(2000) })).token; if (token.startsWith("https://")) { const url = new URL(token); if (!["https://www.tripanize.app", "https://tripanize.app"].includes(url.origin) || !/^\/invite\/[A-Za-z0-9_-]+$/.test(url.pathname)) throw new AppError("VALIDATION", "Paste a Tripanize invitation link."); token = url.pathname.split("/").at(-1)!; } const r = await invites.acceptInvitation(userId, token); return { to: { screen: "itinerary", tripId: r.tripId } }; }
    case "invite.decline": await invites.declineInvitation(userId, parse(z.object({ id })).id); return done;
    case "member.role": { const d = parse(z.object({ id, role: z.enum(["COLLABORATOR", "VIEWER"]) })); await invites.changeRole(userId, tripId, d.id, d.role); return done; }
    case "member.remove": { const d = parse(z.object({ id })); await invites.removeMember(userId, tripId, d.id); return d.id === userId ? { to: { screen: "trips" } } : done; }
    case "member.transfer": await invites.transferOwnership(userId, tripId, parse(z.object({ id })).id); return done;
    case "traveler.add": { const d = parse(z.object({ name: z.string().max(80), isChild: z.boolean() })); await invites.addTraveler(userId, tripId, d.name, d.isChild); return done; }
    case "traveler.rename": { const d = parse(z.object({ id, name: z.string().max(80) })); await invites.renameTraveler(userId, tripId, d.id, d.name); return done; }
    case "traveler.remove": await invites.removePlannedTraveler(userId, tripId, parse(z.object({ id })).id); return done;
    case "poll.create": { const d = parse(z.object({ question: z.string().max(160), kind: z.enum(["DESTINATION", "ACTIVITY"]), options: z.array(z.string().max(160)).min(2).max(8) })); await votes.createPoll(userId, tripId, d); return done; }
    case "poll.vote": { const d = parse(edit.extend({ optionId: id.nullable() })); await votes.castVote(userId, tripId, d.id, d.optionId, d.version); return done; }
    case "poll.decide": { const d = parse(edit.extend({ command: z.enum(["DECIDE", "REOPEN", "ARCHIVE"]), optionId: id.nullable(), note: maybeText })); await votes.decidePoll(userId, tripId, d.id, d.command, d.optionId, d.note ?? null, d.version); return done; }
    case "discovery.draft": { const r = await discovery.createDestinationDraft(userId); return to("discovery", r.id); }
    case "discovery.run": { const d = parse(z.object({ id: id.optional() })); const r = await discovery.startDestinationSearch(userId, v, d.id); return to("discovery", r.id); }
    case "discovery.choose": { const d = parse(z.object({ id, index: z.number().int().min(0).max(4) })); const r = await discovery.chooseDestination(userId, d.id, d.index); return { to: { screen: "settings", tripId: r.id } }; }
    case "profile.save": await updateProfile(userId, profileInput.parse(v)); return done;
    case "account.delete": { const d = parse(z.object({ email: z.string().email(), confirmation: z.literal("DELETE") })); await deleteMobileAccount(userId, sessionId, d.email, d.confirmation); return { signedOut: true }; }
    case "notifications.read": { const d = parse(z.union([z.object({ id }), z.object({ before: z.string().max(40) })])); await markChangeNotificationsRead(userId, d); return done; }
    case "notifications.changes": await setChangeEmailPreference(userId, tripId, parse(z.object({ enabled: z.boolean() })).enabled); return done;
    case "notifications.bookings": await setBookingReminderPreference(userId, tripId, parse(z.object({ enabled: z.boolean() })).enabled); return done;
    case "admin.security": await executeAdminSecurity(userId, adminSecurityCommand.parse(v)); return done;
    case "admin.mode": await setAccountMode(userId, parse(z.object({ mode: z.enum(["NORMAL", "ADMIN"]) })).mode); return to("account");
    case "admin.command": await executeAdminCommand(userId, adminCommand.parse(v)); return done;
    case "admin.search": { const d = parse(z.object({ screen: z.enum(["admin-users", "admin-trips"]), q: z.string().max(100) })); return { to: { screen: d.screen, item: d.q } }; }
    case "support.send": {
      const user = await getMobileUser(userId);
      const d = parse(z.object({ topic: z.enum(["general", "technical", "billing", "privacy"]), message: z.string().min(10).max(4000), requestId: z.uuid() }));
      await submitSupport({ ...d, name: user.name, email: user.email, website: "" }, `mobile:${userId}`);
      return { message: "Your support request was sent.", refresh: true };
    }
    case "trial.create": { const d = parse(z.object({ email: z.string().email().max(254), durationDays: z.number().int().min(1).max(90).nullable().default(14) })); const r = await createTrialInvitation(userId, d.email, d.durationDays); return { message: "Trial invitation created.", url: r.url, refresh: true }; }
    case "trial.revoke": await revokeTrialInvitation(userId, parse(z.object({ id })).id); return done;
    case "trial.accept": { const d = parse(z.object({ invitationId: id, tripId: z.preprocess(value => value === "" ? undefined : value, id.optional()), name: z.preprocess(value => value === "" ? undefined : value, z.string().max(120).optional()) })); const r = await acceptTrialInvitation(userId, d); return { to: { screen: "setup", tripId: r.tripId } }; }
    default: throw new AppError("VALIDATION", "Unknown app action. Update the app and try again.");
  }
}

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { queueDueDiscoveries } from "@/server/events/schedule";
import { runDiscovery } from "@/server/events/discovery";
import { updateDiscoverySettings, setEventStatus } from "@/server/events/service";
import { listChangeNotifications, sendNextChangeEmail, setChangeEmailPreference } from "@/server/notifications/changes";
import { prepareEventDigests } from "@/server/notifications/events";
import { updateNotificationPrefs } from "@/server/profile";
import type { Generator } from "@/server/planner/run";
import { makeUser, makeTrip, resetDb } from "./helpers";
const runtime = currentRuntime(), oldKey = process.env.OPENAI_API_KEY, oldSearch = process.env.OPENAI_WEB_SEARCH;
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); process.env.OPENAI_API_KEY = "isolated-schedule-test"; process.env.OPENAI_WEB_SEARCH = "true"; });
afterEach(() => { setTestRuntime(runtime); if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey; if (oldSearch === undefined) delete process.env.OPENAI_WEB_SEARCH; else process.env.OPENAI_WEB_SEARCH = oldSearch; vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function fixture(premium = true) {
  const owner = await makeUser("Owner"), member = await makeUser("Member"), viewer = await makeUser("Viewer");
  await prisma.user.update({ where: { id: member.id }, data: { emailVerified: true } });
  const tripId = await makeTrip(owner.id, { startDate: "2030-06-15", endDate: "2030-06-20", interests: ["Local culture"], preferences: "Quiet cultural evenings", accessibility: "Step-free venues", pace: "RELAXED", notes: "Avoid late nights" });
  await prisma.trip.update({ where: { id: tripId }, data: { planPrefs: { answers: [{ q: "Which activities?", a: ["Local music"] }] } } });
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } }); await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  if (premium) await prisma.premiumCheckout.create({ data: { tripId, buyerId: owner.id, environment: "live", priceId: "fixture", amountMinor: 1500, targetCapacity: 0, status: "COMPLETED" } });
  return { owner, member, viewer, tripId };
}
const event = (title = "Local cultural evening") => ({ title, category: "cultural", date: "2030-06-16", endDate: null, startTime: "18:00", dateVerified: true, venue: "Fixture venue", city: "Lisbon", address: null, officialUrl: "https://example.test/event", bookingUrl: "https://example.test/tickets", priceText: "Free", availability: "Available", bookingDeadline: null, cancelled: false, soldOut: false, whyFits: "Local music and your relaxed pace", uncertainty: null, sources: [{ url: "https://example.test/event", title: "Official fixture" }] });
function generate(events = [event()], inspect?: (data: any) => void): Generator { return (async (opts: { input: string }) => { inspect?.(JSON.parse(opts.input.match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/)![1])); return { data: { events }, model: "isolated", sources: ["https://example.test/event"], usage: null }; }) as Generator; }
async function run(tripId: string, events = [event()], inspect?: (data: any) => void) { const r = await prisma.discoveryRun.create({ data: { tripId, trigger: "manual" } }); await runDiscovery(r.id, generate(events, inspect)); return prisma.discoveryRun.findUniqueOrThrow({ where: { id: r.id } }); }
it("queues one due search only for an eligible paid trip and recalculates phase transitions", async () => {
  const f = await fixture(); const normal = await fixture(false);
  await prisma.discoveryRun.create({ data: { tripId: f.tripId, trigger: "manual", status: "succeeded", finishedAt: new Date("2030-05-30T12:00Z") } });
  expect(await queueDueDiscoveries(new Date("2030-05-31T12:00Z"))).toBe(0);
  expect(await queueDueDiscoveries(new Date("2030-06-01T10:00Z"))).toBe(1);
  expect(await queueDueDiscoveries(new Date("2030-06-01T11:00Z"))).toBe(0);
  expect(await prisma.discoveryRun.count({ where: { tripId: normal.tripId } })).toBe(0);
  expect((await prisma.discoveryRun.findFirstOrThrow({ where: { tripId: f.tripId, status: "queued" } })).trigger).toBe("scheduled");
});
it("respects pauses, missing AI, ended trips and failure backoff", async () => {
  const f = await fixture(); await updateDiscoverySettings(f.owner.id, f.tripId, { autoDiscovery: false });
  expect(await queueDueDiscoveries(new Date("2030-06-01T10:00Z"))).toBe(0);
  await updateDiscoverySettings(f.owner.id, f.tripId, { autoDiscovery: true });
  await prisma.discoveryRun.create({ data: { tripId: f.tripId, trigger: "scheduled", status: "failed", finishedAt: new Date("2030-06-01T08:00Z") } });
  expect(await queueDueDiscoveries(new Date("2030-06-01T10:00Z"))).toBe(0);
  expect(await queueDueDiscoveries(new Date("2030-06-01T15:00Z"))).toBe(1);
  await prisma.discoveryRun.updateMany({ where: { tripId: f.tripId, status: "queued" }, data: { status: "succeeded", finishedAt: new Date("2030-06-01T16:00Z") } });
  expect(await queueDueDiscoveries(new Date("2030-06-21T10:00Z"))).toBe(0);
  delete process.env.OPENAI_API_KEY; expect(await queueDueDiscoveries(new Date("2030-06-02T10:00Z"))).toBe(0);
});
it("uses full saved preferences and notifies every current member including the organizer", async () => {
  const f = await fixture(); const outsider = await makeUser("Outside");
  const r = await run(f.tripId, [event()], data => { expect(data.preferences).toBe("Quiet cultural evenings"); expect(data.answers.answers[0].a).toEqual(["Local music"]); expect(data.accessibility).toBe("Step-free venues"); expect(data.pace).toBe("RELAXED"); });
  expect(r.status, r.error ?? "").toBe("succeeded");
  for (const user of [f.owner, f.member, f.viewer]) { const inbox = await listChangeNotifications(user.id); expect(inbox.unread).toBe(1); expect(inbox.items[0].summary).toContain("Local cultural evening"); expect(inbox.items[0].href).toContain("/events?event="); }
  expect((await listChangeNotifications(outsider.id)).unread).toBe(0);
  expect(await prisma.tripNotification.count({ where: { emailStatus: "queued" } })).toBe(0);
  await run(f.tripId); expect((await listChangeNotifications(f.owner.id)).unread).toBe(1);
  expect(await prisma.stop.count({ where: { tripId: f.tripId } })).toBe(0);
});
it("keeps hidden events quiet and skips cancelled, sold-out and past new-event alerts", async () => {
  const f = await fixture(); await run(f.tripId); const e = await prisma.tripEvent.findFirstOrThrow({ where: { tripId: f.tripId } });
  await setEventStatus(f.owner.id, f.tripId, e.id, "HIDDEN"); const count = await prisma.tripNotification.count({ where: { kind: "event" } });
  await run(f.tripId, [{ ...event(), priceText: "€20" }, { ...event("Cancelled fixture"), cancelled: true }, { ...event("Sold-out fixture"), soldOut: true }]);
  expect(await prisma.tripNotification.count({ where: { kind: "event" } })).toBe(count);
});
it("queues one immutable opt-in email per search, retries safely, and keeps email-only rows out of the inbox", async () => {
  const f = await fixture(); await updateNotificationPrefs(f.member.id, f.tripId, { emailEnabled: true, frequency: "immediate", changeTypes: ["new", "price"] });
  await run(f.tripId, [event(), event("Another cultural event")]);
  expect((await listChangeNotifications(f.member.id)).unread).toBe(2);
  const rows = await prisma.tripNotification.findMany({ where: { kind: "event_email" } }); expect(rows).toHaveLength(1); expect(rows[0].emailText).toContain("Another cultural event");
  const send = vi.fn().mockResolvedValueOnce({ status: "failed", error: "Synthetic temporary error", retryable: true }).mockResolvedValue({ status: "sent", providerId: "fixture" });
  await sendNextChangeEmail(send); await prisma.tripNotification.updateMany({ where: { kind: "event_email", emailStatus: "queued" }, data: { nextAttemptAt: new Date(0) } }); await sendNextChangeEmail(send);
  expect(send.mock.calls[0][0]).toEqual(send.mock.calls[1][0]); expect(send.mock.calls[0][0].idempotencyKey).toMatch(/^trip-events\//);
  expect(await prisma.tripNotification.count({ where: { kind: "event_email", emailStatus: "sent" } })).toBe(1);
});
it("coalesces daily email batches after restart and respects event opt-out separately from shared-edit alerts", async () => {
  const f = await fixture(); await updateNotificationPrefs(f.member.id, f.tripId, { emailEnabled: true, frequency: "daily", changeTypes: ["new"] });
  await run(f.tripId); await run(f.tripId, [event(), event("Second matching event")]);
  expect(await prisma.tripNotification.count({ where: { kind: "event_email", emailStatus: "digest" } })).toBe(2);
  await prisma.tripNotification.updateMany({ where: { emailStatus: "digest" }, data: { nextAttemptAt: new Date(0) } }); await prepareEventDigests(); await prepareEventDigests();
  expect(await prisma.tripNotification.count({ where: { kind: "event_email", emailStatus: "queued" } })).toBe(1);
  const queued = await prisma.tripNotification.findFirstOrThrow({ where: { kind: "event_email", emailStatus: "queued" } }); expect(queued.emailText).toContain("Second matching event");
  await setChangeEmailPreference(f.member.id, f.tripId, false); expect((await prisma.tripNotification.findUniqueOrThrow({ where: { id: queued.id } })).emailStatus).toBe("queued");
  await updateNotificationPrefs(f.member.id, f.tripId, { emailEnabled: false, frequency: "daily", changeTypes: ["new"] }); const send = vi.fn(); await sendNextChangeEmail(send); expect(send).not.toHaveBeenCalled();
});
it("rolls events and alerts back together and discards searches made stale by preference changes", async () => {
  const f = await fixture();
  const r = await prisma.discoveryRun.create({ data: { tripId: f.tripId, trigger: "scheduled" } });
  await runDiscovery(r.id, (async () => { await prisma.trip.update({ where: { id: f.tripId }, data: { planPrefs: { answers: [] } } }); return { data: { events: [event()] }, model: "fixture", sources: [], usage: null }; }) as Generator);
  expect((await prisma.discoveryRun.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("failed");
  expect(await prisma.tripEvent.count({ where: { tripId: f.tripId } })).toBe(0); expect(await prisma.tripNotification.count({ where: { tripId: f.tripId, kind: "event" } })).toBe(0);
});

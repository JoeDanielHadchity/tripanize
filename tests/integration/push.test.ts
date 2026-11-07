import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { changePush, getPushSettings, sendDuePush } from "@/server/push/service";
import { queueTripReminders } from "@/server/push/reminders";
import { sendChatMessage } from "@/server/chat/service";
import { createInvitation } from "@/server/invitations/service";
import { makeTrip, makeUser, resetDb } from "./helpers";

const runtime = currentRuntime();
beforeEach(resetDb);
afterEach(() => setTestRuntime(runtime));
const token = (n: string) => `ExponentPushToken[${n.padEnd(12, "x")}]`;

async function fixture() {
  const owner = await makeUser("Ana"), friend = await makeUser("Ben");
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: friend.id, role: "COLLABORATOR" } });
  await prisma.$executeRawUnsafe(`INSERT INTO "PremiumCheckout" ("id","tripId","buyerId","environment","priceId","amountMinor","targetCapacity","status","reviewRequired","createdAt","updatedAt") VALUES ('${randomUUID()}','${tripId}','${owner.id}','live','test',1500,0,'COMPLETED',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`);
  setTestRuntime({ ...runtime, planAccessEnabled: true });
  return { owner, friend, tripId };
}

it("registers Expo tokens only, moves a phone to the latest account and stores category settings", async () => {
  const { owner, friend } = await fixture();
  await expect(changePush(owner.id, { op: "register", token: "fcm-raw-token", platform: "android" })).rejects.toMatchObject({ code: "VALIDATION" });
  await changePush(owner.id, { op: "register", token: token("phone1"), platform: "android", appVersion: "0.3.0" });
  expect((await getPushSettings(owner.id)).devices).toBe(1);
  await changePush(friend.id, { op: "register", token: token("phone1"), platform: "android" });
  expect((await getPushSettings(owner.id)).devices).toBe(0);
  expect((await getPushSettings(friend.id)).devices).toBe(1);
  const changed = await changePush(friend.id, { op: "settings", settings: { chat: false } });
  expect(changed.settings).toEqual({ chat: false, events: true, group: true, reminders: true });
  await changePush(friend.id, { op: "unregister", token: token("phone1") });
  expect((await getPushSettings(friend.id)).devices).toBe(0);
});

it("queues one collapsing, text-free chat push per recipient and respects the chat setting", async () => {
  const { owner, friend, tripId } = await fixture();
  await changePush(friend.id, { op: "register", token: token("ben"), platform: "ios" });
  await sendChatMessage(owner.id, tripId, { clientId: randomUUID(), body: "Secret dinner plan" });
  await sendChatMessage(owner.id, tripId, { clientId: randomUUID(), body: "Second" });
  const queued = await prisma.pushMessage.findMany();
  expect(queued).toHaveLength(1); // the owner has no device; Ben's two messages collapse
  expect(queued[0]).toMatchObject({ userId: friend.id, category: "chat", body: "2 new messages in trip chat.", href: `/trips/${tripId}/chat` });
  expect(JSON.stringify(queued)).not.toContain("Secret");
  await changePush(friend.id, { op: "settings", settings: { chat: false } });
  expect(await prisma.pushMessage.count({ where: { status: "queued" } })).toBe(0);
  await sendChatMessage(owner.id, tripId, { clientId: randomUUID(), body: "Third" });
  expect(await prisma.pushMessage.count({ where: { status: "queued" } })).toBe(0);
});

it("tells an existing user about an invitation", async () => {
  const { owner, tripId } = await fixture();
  const guest = await makeUser("Cara", `cara-${randomUUID().slice(0, 5)}@example.test`);
  await prisma.user.update({ where: { id: guest.id }, data: { emailVerified: true } });
  await changePush(guest.id, { op: "register", token: token("cara"), platform: "android" });
  await createInvitation(owner.id, tripId, { role: "VIEWER", email: guest.email });
  expect(await prisma.pushMessage.findFirst({ where: { userId: guest.id } })).toMatchObject({ category: "group", href: "/trips" });
});

it("sends batches through Expo, removes dead devices and retries outages with backoff", async () => {
  const { owner, friend, tripId } = await fixture();
  await changePush(friend.id, { op: "register", token: token("ben"), platform: "ios" });
  await changePush(friend.id, { op: "register", token: token("old"), platform: "android" });
  await sendChatMessage(owner.id, tripId, { clientId: randomUUID(), body: "Hi" });
  const requests: unknown[] = [];
  const ok: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { to: string }[]; requests.push(body);
    return Response.json({ data: body.map(m => m.to === token("old") ? { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: randomUUID() }) });
  };
  const down: typeof fetch = async () => new Response("busy", { status: 503 });
  await sendDuePush(down);
  const retry = await prisma.pushMessage.findFirstOrThrow();
  expect(retry).toMatchObject({ status: "queued", attempts: 1 });
  expect(retry.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  await sendDuePush(ok, new Date(Date.now() + 3 * 3600_000));
  expect(requests).toHaveLength(1);
  expect(await prisma.pushMessage.findFirstOrThrow()).toMatchObject({ status: "sent" });
  expect((await prisma.pushDevice.findMany()).map(d => d.token)).toEqual([token("ben")]);
});

it("queues the evening-before and morning-of reminders once, in the trip's time zone", async () => {
  const { owner, friend, tripId } = await fixture();
  await changePush(friend.id, { op: "register", token: token("ben"), platform: "ios" });
  const day = await prisma.itineraryDay.findFirstOrThrow({ where: { tripId, date: "2027-05-02" } });
  await prisma.stop.deleteMany({ where: { tripId } });
  await prisma.stop.createMany({ data: [{ tripId, dayId: day.id, title: "Belém Tower", startTime: "09:30", position: 0 }, { tripId, dayId: day.id, title: "Pastéis", position: 1 }, { tripId, dayId: day.id, title: "Skipped", position: 2, status: "SKIPPED" }] });
  // 19:00 in Lisbon (UTC+1 in May) the day before departure.
  await queueTripReminders(new Date("2027-04-30T18:00:00Z"));
  await queueTripReminders(new Date("2027-04-30T19:00:00Z"));
  // 08:00 in Lisbon on day 2.
  await queueTripReminders(new Date("2027-05-02T07:00:00Z"));
  // 15:00: too late for a morning plan.
  await queueTripReminders(new Date("2027-05-03T14:00:00Z"));
  const pushes = await prisma.pushMessage.findMany({ orderBy: { createdAt: "asc" } });
  expect(pushes.map(p => p.dedupeKey)).toEqual([`reminder:depart:${tripId}:2027-05-01`, `reminder:day:${tripId}:2027-05-02`]);
  expect(pushes[1]).toMatchObject({ body: "09:30 Belém Tower · Pastéis", category: "reminders" });
  expect(pushes[1].title.startsWith("Day 2")).toBe(true);
  expect(pushes.every(p => p.userId === friend.id && p.userId !== owner.id)).toBe(true);
});

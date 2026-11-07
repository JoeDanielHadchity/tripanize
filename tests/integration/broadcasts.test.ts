import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { adminBroadcasts, sendBroadcast, sendDueBroadcastEmails, setNewsEmails, unsubscribeUrl, verifyUnsubscribe } from "@/server/admin/broadcasts";
import { changePush } from "@/server/push/service";
import { makeUser, resetDb, adminAuthenticationFixture } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, companyAdminEmail: "admin@example.test", appUrl: "https://tripanize.example.test" }); });
afterEach(() => { setTestRuntime(runtime); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const token = (n: number) => `ExponentPushToken[device${String(n).padStart(6, "0")}]`;
async function people() {
  const admin = await makeUser("Administrator", "admin@example.test");
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: true } });
  await adminAuthenticationFixture(admin.id);
  const withApp = await makeUser("Ana"), newsOff = await makeUser("Ben"), emailOnly = await makeUser("Cy"), unverified = await makeUser("Dee"), suspended = await makeUser("Eve");
  await prisma.pushDevice.createMany({ data: [withApp, newsOff, suspended].map((u, i) => ({ userId: u.id, token: token(i), platform: "android" })) });
  await changePush(newsOff.id, { op: "settings", settings: { news: false } });
  await prisma.user.updateMany({ where: { id: { in: [withApp.id, emailOnly.id, suspended.id] } }, data: { emailVerified: true } });
  for (const u of [withApp, emailOnly, unverified, suspended]) await setNewsEmails(u.id, true);
  await prisma.user.update({ where: { id: suspended.id }, data: { suspendedAt: new Date() } });
  return { admin, withApp, newsOff, emailOnly, unverified, suspended };
}
const message = { title: "New trip ideas", body: "Lisbon is here.", href: "/examples", channels: "both" as const, audience: "all" as const, test: false };

it("only the company administrator can see or send messages, and links stay on Tripanize", async () => {
  const { admin, withApp } = await people();
  await expect(adminBroadcasts(withApp.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(sendBroadcast(withApp.id, message)).rejects.toMatchObject({ code: "FORBIDDEN" });
  vi.stubEnv("RESEND_API_KEY", "isolated-key");
  await expect(sendBroadcast(admin.id, { ...message, href: "https://evil.example" })).rejects.toThrow();
  await expect(sendBroadcast(admin.id, { ...message, href: "//evil.example" })).rejects.toThrow();
});

it("counts and reaches only phones with news on and people who opted in to email", async () => {
  const { admin, withApp, emailOnly } = await people();
  vi.stubEnv("RESEND_API_KEY", "isolated-key"); vi.stubEnv("SMTP_URL", "");
  const d = await adminBroadcasts(admin.id);
  expect(d.reach.all).toMatchObject({ push: 1, email: 2 });
  expect(d.optedIn).toBe(2);

  const sent = vi.fn(async () => Response.json({ id: "fixture" }));
  vi.stubGlobal("fetch", sent);
  const result = await sendBroadcast(admin.id, message);
  expect(result).toMatchObject({ push: 1, email: 2 });
  expect((await prisma.pushMessage.findMany()).map(m => [m.userId, m.category])).toEqual([[withApp.id, "news"]]);
  expect((await prisma.broadcastDelivery.findMany()).map(d => d.userId).sort()).toEqual([withApp.id, emailOnly.id].sort());
  expect((await prisma.broadcast.findFirstOrThrow()).status).toBe("SENDING");

  await setNewsEmails(emailOnly.id, false); // unsubscribed after the send started
  expect(await sendDueBroadcastEmails()).toBe(false);
  expect(sent).toHaveBeenCalledTimes(1);
  const body = JSON.parse(String((sent.mock.calls[0] as unknown as [string, RequestInit])[1].body));
  expect(body.to).toEqual([(await prisma.user.findUniqueOrThrow({ where: { id: withApp.id } })).email]);
  expect(body.text).toContain("https://tripanize.example.test/examples");
  expect(body.text).toContain("/api/news/unsubscribe?u=");
  const b = await prisma.broadcast.findFirstOrThrow();
  expect(b).toMatchObject({ status: "SENT", emailSent: 1 });
  expect((await prisma.broadcastDelivery.findMany({ where: { status: "skipped" } })).map(d => d.userId)).toEqual([emailOnly.id]);
});

it("a test goes only to the administrator", async () => {
  const { admin } = await people();
  await prisma.pushDevice.create({ data: { userId: admin.id, token: token(9), platform: "ios" } });
  const result = await sendBroadcast(admin.id, { ...message, channels: "push", test: true });
  expect(result).toMatchObject({ test: true, push: 1 });
  expect((await prisma.pushMessage.findMany()).map(m => m.userId)).toEqual([admin.id]);
  expect(await prisma.broadcast.count()).toBe(0);
});

it("refuses email when it isn't configured, and signs unsubscribe links", async () => {
  const { admin, withApp } = await people();
  vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("SMTP_URL", "");
  await expect(sendBroadcast(admin.id, message)).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  const url = new URL(unsubscribeUrl(withApp.id));
  expect(verifyUnsubscribe(withApp.id, url.searchParams.get("s")!)).toBe(true);
  expect(verifyUnsubscribe(admin.id, url.searchParams.get("s")!)).toBe(false);
});

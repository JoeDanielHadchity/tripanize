import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import { appRuntime, currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { sessionAccountMode, setAccountMode } from "@/server/admin/mode";
import { requireCompanyAdmin, hasAdminAuthentication } from "@/server/admin/identity";
import { adminSecurityStatus, executeAdminSecurity, adminSecurityCommand, ADMIN_UNLOCK_MS, ADMIN_EMAIL_CODE_MS } from "@/server/admin/security";
import { adminOverview } from "@/server/admin/operations";
import { makeUser, resetDb } from "./helpers";
const requestState = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestState.headers }));
import { POST } from "@/app/api/account/security/route";
const runtime = currentRuntime(), origin = "https://admin-security.example.test";
beforeEach(async () => {
  await resetDb(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-24T10:00:00Z"));
  setTestRuntime({ ...runtime, companyAdminEmail: "admin@example.test", appUrl: origin, planAccessEnabled: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); setTestRuntime(runtime); requestState.headers = new Headers(); });
async function fixture() {
  const admin = await makeUser("Tripanize.app", "admin@example.test"), other = await makeUser("Traveler");
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: true } });
  const session = await newSession(admin.id);
  return { admin, other, session };
}
const newSession = (userId: string) => prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86400_000) } });
async function inSession<T>(userId: string, sessionId: string, fn: () => Promise<T>) { return appRuntime.run({ ...currentRuntime(), accountMode: await sessionAccountMode(userId, sessionId) }, fn); }
const command = (userId: string, sessionId: string, value: Parameters<typeof executeAdminSecurity>[1], deliver?: Parameters<typeof executeAdminSecurity>[2]) => inSession(userId, sessionId, () => executeAdminSecurity(userId, value, deliver));
const advance = (ms = 61_000) => vi.setSystemTime(Date.now() + ms);
async function emailCode(userId: string, sessionId: string) {
  let value = "";
  const deliver = vi.fn(async (message: { to: string; text: string }) => { expect(message.to).toBe("admin@example.test"); value = message.text.match(/\b\d{6}\b/)![0]; return { status: "sent" as const, providerId: "isolated-mail" }; });
  const response = await command(userId, sessionId, { op: "send-code" }, deliver);
  return { value, response, deliver };
}
async function unlock() { const f = await fixture(), sent = await emailCode(f.admin.id, f.session.id); await command(f.admin.id, f.session.id, { op: "unlock", code: sent.value }); return { ...f, sent }; }
it("requires a dedicated email code and rejects legacy authenticator proof or enrollment operations", async () => {
  const f = await fixture();
  await prisma.adminAuthenticator.create({ data: { userId: f.admin.id, enabledAt: new Date(), encryptedSecret: "legacy-factor", recoveryHashes: ["legacy-recovery"] } });
  await prisma.session.update({ where: { id: f.session.id }, data: { adminVerifiedUntil: new Date(Date.now() + ADMIN_UNLOCK_MS), adminEmailVerifiedAt: new Date() } });
  await inSession(f.admin.id, f.session.id, async () => {
    expect(await hasAdminAuthentication(f.admin.id)).toBe(false);
    await expect(adminOverview(f.admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setAccountMode(f.admin.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  for (const op of ["enroll", "confirm", "recovery-codes"]) expect(adminSecurityCommand.safeParse({ op, code: "123456" }).success).toBe(false);
  expect(adminSecurityCommand.safeParse({ op: "unlock", code: "123456", recovery: true }).success).toBe(false);
});
it("delivers only to the configured owner, stores a keyed hash, and never returns or audits a code", async () => {
  const f = await fixture(), sent = await emailCode(f.admin.id, f.session.id);
  expect(sent.deliver).toHaveBeenCalledOnce();
  expect(sent.response).toMatchObject({ ok: true, expiresAt: new Date(Date.now() + ADMIN_EMAIL_CODE_MS).toISOString() });
  const stored = await prisma.adminEmailChallenge.findUniqueOrThrow({ where: { userId: f.admin.id } });
  expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/); expect(stored.sessionId).toBe(f.session.id);
  for (const data of [JSON.stringify(stored), JSON.stringify(sent.response), JSON.stringify(await prisma.adminAudit.findMany())]) expect(data).not.toContain(sent.value);
  await inSession(f.admin.id, f.session.id, async () => { expect(await adminSecurityStatus(f.admin.id)).toMatchObject({ unlocked: false, codeSent: true }); await expect(requireCompanyAdmin(f.admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" }); });
  expect(await prisma.adminAuthenticator.count()).toBe(0);
});
it("consumes a delivered code once and unlocks only its requesting live browser session", async () => {
  const f = await fixture(), sent = await emailCode(f.admin.id, f.session.id), second = await newSession(f.admin.id);
  await expect(command(f.admin.id, second.id, { op: "unlock", code: sent.value })).rejects.toMatchObject({ code: "VALIDATION" });
  await command(f.admin.id, f.session.id, { op: "unlock", code: sent.value });
  await inSession(f.admin.id, f.session.id, async () => { await requireCompanyAdmin(f.admin.id); expect((await adminOverview(f.admin.id)).users).toBe(2); });
  await inSession(f.admin.id, second.id, () => expect(requireCompanyAdmin(f.admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" }));
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: sent.value })).rejects.toMatchObject({ code: "VALIDATION" });
  expect((await prisma.adminEmailChallenge.findUniqueOrThrow({ where: { userId: f.admin.id } })).codeHash).toBeNull();
});
it("enforces expiry and invalidates an earlier email when a new code is sent", async () => {
  const f = await fixture(), old = await emailCode(f.admin.id, f.session.id); advance();
  const latest = await emailCode(f.admin.id, f.session.id);
  if (old.value !== latest.value) await expect(command(f.admin.id, f.session.id, { op: "unlock", code: old.value })).rejects.toMatchObject({ code: "VALIDATION" });
  advance(ADMIN_EMAIL_CODE_MS);
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: latest.value })).rejects.toMatchObject({ code: "VALIDATION" });
  await inSession(f.admin.id, f.session.id, () => expect(adminSecurityStatus(f.admin.id)).resolves.toMatchObject({ codeSent: false, unlocked: false }));
});
it("limits resends across sessions and does not reset incorrect attempts when resending", async () => {
  const f = await fixture(), first = await emailCode(f.admin.id, f.session.id), second = await newSession(f.admin.id);
  const deliver = vi.fn();
  await expect(command(f.admin.id, second.id, { op: "send-code" }, deliver)).rejects.toMatchObject({ code: "RATE_LIMITED" }); expect(deliver).not.toHaveBeenCalled();
  const wrong = first.value === "000000" ? "111111" : "000000";
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: wrong })).rejects.toMatchObject({ code: "VALIDATION" });
  advance(); await emailCode(f.admin.id, second.id);
  expect((await prisma.adminEmailChallenge.findUniqueOrThrow({ where: { userId: f.admin.id } })).failedAttempts).toBe(1);
  for (let i = 0; i < 3; i++) { advance(); await emailCode(f.admin.id, second.id); }
  advance(); await expect(command(f.admin.id, second.id, { op: "send-code" }, deliver)).rejects.toMatchObject({ code: "RATE_LIMITED" });
});
it("commits the five-attempt lockout across sessions and permits a fresh code after 15 minutes", async () => {
  const f = await fixture(), sent = await emailCode(f.admin.id, f.session.id), second = await newSession(f.admin.id);
  const wrong = sent.value === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await expect(command(f.admin.id, f.session.id, { op: "unlock", code: wrong })).rejects.toMatchObject({ code: i === 4 ? "RATE_LIMITED" : "VALIDATION" });
  const stored = await prisma.adminEmailChallenge.findUniqueOrThrow({ where: { userId: f.admin.id } }); expect(stored.failedAttempts).toBe(5); expect(stored.codeHash).toBeNull();
  await expect(command(f.admin.id, second.id, { op: "send-code" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  advance(15 * 60_000 + 1); const fresh = await emailCode(f.admin.id, second.id); await command(f.admin.id, second.id, { op: "unlock", code: fresh.value });
});
it("leaves Admin locked and invalidates undelivered codes when email delivery fails or throws", async () => {
  const f = await fixture();
  for (const failure of [async () => ({ status: "not_configured" as const }), async () => { throw new Error("Synthetic failure"); }]) {
    await expect(command(f.admin.id, f.session.id, { op: "send-code" }, failure)).rejects.toMatchObject({ code: "UPSTREAM" });
    expect((await prisma.adminEmailChallenge.findUniqueOrThrow({ where: { userId: f.admin.id } })).codeHash).toBeNull();
    await inSession(f.admin.id, f.session.id, () => expect(hasAdminAuthentication(f.admin.id)).resolves.toBe(false)); advance();
  }
});
it("requires a new email code after lock, expiry or Normal mode without signing out the user", async () => {
  const f = await unlock();
  await inSession(f.admin.id, f.session.id, () => setAccountMode(f.admin.id, "NORMAL"));
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: f.sent.value })).rejects.toMatchObject({ code: "VALIDATION" });
  await inSession(f.admin.id, f.session.id, () => expect(setAccountMode(f.admin.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" }));
  advance(); const next = await emailCode(f.admin.id, f.session.id); await command(f.admin.id, f.session.id, { op: "unlock", code: next.value });
  await command(f.admin.id, f.session.id, { op: "lock" });
  await inSession(f.admin.id, f.session.id, () => expect(hasAdminAuthentication(f.admin.id)).resolves.toBe(false));
  advance(); const again = await emailCode(f.admin.id, f.session.id); await command(f.admin.id, f.session.id, { op: "unlock", code: again.value });
  advance(ADMIN_UNLOCK_MS + 1);
  await inSession(f.admin.id, f.session.id, () => expect(adminOverview(f.admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" }));
  expect(await prisma.session.findUnique({ where: { id: f.session.id } })).not.toBeNull();
});
it("cancels a pending code on Normal mode and never unlocks before provider acceptance", async () => {
  const f = await fixture(); let captured = "";
  await command(f.admin.id, f.session.id, { op: "send-code" }, async message => {
    captured = message.text.match(/\b\d{6}\b/)![0];
    await expect(command(f.admin.id, f.session.id, { op: "unlock", code: captured })).rejects.toMatchObject({ code: "VALIDATION" });
    return { status: "sent", providerId: "fixture" };
  });
  await inSession(f.admin.id, f.session.id, () => setAccountMode(f.admin.id, "NORMAL"));
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: captured })).rejects.toMatchObject({ code: "VALIDATION" });
});
it("denies other, suspended, unverified and revoked sessions without sending any email", async () => {
  const f = await fixture(), deliver = vi.fn();
  await inSession(f.admin.id, f.session.id, () => expect(executeAdminSecurity(f.other.id, { op: "send-code" }, deliver)).rejects.toMatchObject({ code: "FORBIDDEN" }));
  await prisma.user.update({ where: { id: f.admin.id }, data: { suspendedAt: new Date() } });
  await expect(command(f.admin.id, f.session.id, { op: "send-code" }, deliver)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.user.update({ where: { id: f.admin.id }, data: { suspendedAt: null, emailVerified: false } });
  await expect(command(f.admin.id, f.session.id, { op: "send-code" }, deliver)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.user.update({ where: { id: f.admin.id }, data: { emailVerified: true } });
  await prisma.session.delete({ where: { id: f.session.id } });
  await expect(command(f.admin.id, f.session.id, { op: "send-code" }, deliver)).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(deliver).not.toHaveBeenCalled();
});
it("keeps general email sign-in separate and protects private proof fields and the real HTTP verification API", async () => {
  const call = (path: string, body: object) => auth.handler(new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  const signedUp = await call("sign-up/email", { name: "Tripanize.app", email: "admin@example.test", password: "Example-password-for-isolated-test!", adminEmailUnlockedAt: new Date().toISOString(), adminVerifiedUntil: new Date(Date.now() + ADMIN_UNLOCK_MS).toISOString() }); expect(signedUp.status).toBe(200);
  let emailed = "";
  vi.stubEnv("RESEND_API_KEY", "isolated-no-network-key"); vi.stubEnv("SMTP_URL", "");
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => { emailed = JSON.parse(String(init?.body)).text as string; return Response.json({ id: "isolated-fixture" }); }));
  expect((await call("email-otp/send-verification-otp", { email: "admin@example.test", type: "sign-in" })).status).toBe(200);
  const signed = await call("sign-in/email-otp", { email: "admin@example.test", otp: emailed.match(/\b\d{6}\b/)![0] }); expect(signed.status).toBe(200);
  const cookie = signed.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const data = await (await auth.handler(new Request(`${origin}/api/auth/get-session`, { headers: { Cookie: cookie } }))).json() as { user: { id: string }; session: { id: string } & Record<string, unknown> };
  expect(data.session).not.toHaveProperty("adminEmailUnlockedAt"); expect(data.session).not.toHaveProperty("adminVerifiedUntil");
  const session = await prisma.session.findUniqueOrThrow({ where: { id: data.session.id } }); expect(session.adminEmailUnlockedAt).toBeNull(); expect(session.adminVerifiedUntil).toBeNull();
  requestState.headers = new Headers({ Cookie: cookie });
  await inSession(data.user.id, session.id, async () => {
    await expect(requireCompanyAdmin(data.user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const request = (body: string) => new Request(`${origin}/api/account/security`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
    expect((await POST(request('{"op":"send-code","email":"other@example.test"}'))).status).toBe(400);
    expect((await POST(request(" ".repeat(2049)))).status).toBe(413);
    const sent = await POST(request('{"op":"send-code"}')); expect(sent.status).toBe(200); expect(sent.headers.get("Cache-Control")).toBe("private, no-store");
    const code = emailed.match(/\b\d{6}\b/)![0]; expect(JSON.stringify(await sent.json())).not.toContain(code);
    const verified = await POST(request(JSON.stringify({ op: "unlock", code }))); expect(verified.status).toBe(200); await requireCompanyAdmin(data.user.id);
  });
});
it("protects the security API with origin, authentication and a streamed body bound", async () => {
  const request = (body: string, headers: Record<string, string> = {}) => new Request(`${origin}/api/account/security`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body });
  expect((await POST(request('{"op":"send-code"}', { Origin: "https://outside.example.test" }))).status).toBe(403);
  expect((await POST(request('{"op":"send-code"}'))).status).toBe(401);
  expect((await POST(request("{}", { "Content-Length": "2049" }))).status).toBe(413);
  expect(await prisma.adminEmailChallenge.count()).toBe(0);
});

import { randomUUID } from "node:crypto";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { auth } from "@/server/auth/auth";
import { appRuntime, currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { sessionAccountMode, setAccountMode } from "@/server/admin/mode";
import { requireCompanyAdmin, hasAdminAuthentication } from "@/server/admin/identity";
import { adminSecurityStatus, executeAdminSecurity, ADMIN_UNLOCK_MS } from "@/server/admin/security";
import { adminOverview } from "@/server/admin/operations";
import { makeUser, resetDb } from "./helpers";
const requestState = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestState.headers }));
import { POST } from "@/app/api/account/security/route";
const runtime = currentRuntime(), origin = "https://admin-security.example.test";
beforeEach(async () => {
  await resetDb();
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-23T14:00:00Z"));
  setTestRuntime({ ...runtime, companyAdminEmail: "admin@example.test", appUrl: origin, planAccessEnabled: true });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); setTestRuntime(runtime); requestState.headers = new Headers(); });
async function fixture() {
  const admin = await makeUser("Tripanize.app", "admin@example.test"), other = await makeUser("Traveler");
  await prisma.user.update({ where: { id: admin.id }, data: { emailVerified: true } });
  const session = await newSession(admin.id, true);
  return { admin, other, session };
}
const newSession = (userId: string, fresh = false) => prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId, expiresAt: new Date(Date.now() + 86400_000), ...(fresh ? { adminEmailVerifiedAt: new Date() } : {}) } });
async function inSession<T>(userId: string, sessionId: string, fn: () => Promise<T>) {
  return appRuntime.run({ ...currentRuntime(), accountMode: await sessionAccountMode(userId, sessionId) }, fn);
}
const command = (userId: string, sessionId: string, value: Parameters<typeof executeAdminSecurity>[1]) => inSession(userId, sessionId, () => executeAdminSecurity(userId, value));
const advance = (ms = 30_000) => vi.setSystemTime(Date.now() + ms);
const otp = (secret: string) => createOTP(secret).hotp(Math.floor(Date.now() / 30_000));
function enrollmentSecret(result: Awaited<ReturnType<typeof executeAdminSecurity>>) {
  if (!("uri" in result) || !result.uri) throw new Error("Missing test enrollment URI");
  return Buffer.from(base32.decode(new URL(result.uri).searchParams.get("secret")!)).toString("utf8");
}
async function enroll() {
  const f = await fixture();
  const prepared = await command(f.admin.id, f.session.id, { op: "enroll" });
  const secret = enrollmentSecret(prepared);
  const confirmed = await command(f.admin.id, f.session.id, { op: "confirm", code: await otp(secret) });
  if (!("recoveryCodes" in confirmed) || !confirmed.recoveryCodes) throw new Error("Missing fixture recovery codes");
  return { ...f, secret, prepared, codes: confirmed.recoveryCodes };
}
it("denies admin reads and direct mode changes until a factor is enrolled and verified", async () => {
  const { admin, session } = await fixture();
  await inSession(admin.id, session.id, async () => {
    expect(await hasAdminAuthentication(admin.id)).toBe(false);
    await expect(requireCompanyAdmin(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(adminOverview(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setAccountMode(admin.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  await prisma.session.update({ where: { id: session.id }, data: { adminVerifiedUntil: new Date(Date.now() + ADMIN_UNLOCK_MS) } });
  await inSession(admin.id, session.id, () => expect(hasAdminAuthentication(admin.id)).resolves.toBe(false));
  await expect(requireCompanyAdmin(admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("requires recent email-code proof and binds pending enrollment to its live session", async () => {
  const { admin, session } = await fixture();
  await prisma.session.update({ where: { id: session.id }, data: { adminEmailVerifiedAt: null } });
  await expect(command(admin.id, session.id, { op: "enroll" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.session.update({ where: { id: session.id }, data: { adminEmailVerifiedAt: new Date() } });
  const prepared = await command(admin.id, session.id, { op: "enroll" }), secret = enrollmentSecret(prepared);
  const second = await newSession(admin.id, true);
  await expect(command(admin.id, second.id, { op: "confirm", code: await otp(secret) })).rejects.toMatchObject({ code: "VALIDATION" });
  advance(10 * 60_000 + 1);
  await expect(command(admin.id, session.id, { op: "confirm", code: await otp(secret) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect((await prisma.adminAuthenticator.findUniqueOrThrow({ where: { userId: admin.id } })).enabledAt).toBeNull();
});
it("encrypts the secret, hashes recovery codes, and unlocks only the verified session", async () => {
  const f = await enroll();
  await inSession(f.admin.id, f.session.id, async () => {
    await requireCompanyAdmin(f.admin.id);
    expect(await adminSecurityStatus(f.admin.id)).toMatchObject({ enrolled: true, unlocked: true, recoveryRemaining: 10 });
    expect((await adminOverview(f.admin.id)).users).toBe(2);
  });
  const other = await newSession(f.admin.id);
  await inSession(f.admin.id, other.id, () => expect(requireCompanyAdmin(f.admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" }));
  const stored = JSON.stringify(await prisma.adminAuthenticator.findUniqueOrThrow({ where: { userId: f.admin.id } }));
  expect(stored).not.toContain(f.secret); expect(stored).not.toContain(f.codes[0]); expect(stored).not.toContain("otpauth:");
  const logs = JSON.stringify(await prisma.adminAudit.findMany());
  const uri = createOTP(f.secret).url("Tripanize.app", f.admin.email);
  for (const secret of [f.secret, f.codes[0], await otp(f.secret), uri, new URL(uri).searchParams.get("secret")!]) expect(logs).not.toContain(secret);
});
it("blocks code replay across sessions and demands a fresh code after Normal mode", async () => {
  const f = await enroll(), second = await newSession(f.admin.id);
  await expect(command(f.admin.id, second.id, { op: "unlock", code: await otp(f.secret) })).rejects.toMatchObject({ code: "VALIDATION" });
  advance();
  const used = await otp(f.secret);
  await command(f.admin.id, second.id, { op: "unlock", code: used });
  await inSession(f.admin.id, second.id, () => setAccountMode(f.admin.id, "NORMAL"));
  await inSession(f.admin.id, second.id, () => expect(setAccountMode(f.admin.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" }));
  await expect(command(f.admin.id, second.id, { op: "unlock", code: used })).rejects.toMatchObject({ code: "VALIDATION" });
  advance(); await command(f.admin.id, second.id, { op: "unlock", code: await otp(f.secret) });
  await inSession(f.admin.id, second.id, () => requireCompanyAdmin(f.admin.id));
});
it("commits five-attempt lockouts across sessions and releases after 15 minutes", async () => {
  const f = await enroll(), second = await newSession(f.admin.id);
  const wrong = (await otp(f.secret)) === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) await expect(command(f.admin.id, second.id, { op: "unlock", code: wrong })).rejects.toMatchObject({ code: i === 4 ? "RATE_LIMITED" : "VALIDATION" });
  expect((await prisma.adminAuthenticator.findUniqueOrThrow({ where: { userId: f.admin.id } })).failedAttempts).toBe(5);
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: f.codes[0], recovery: true })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  advance(15 * 60_000 + 1);
  await command(f.admin.id, second.id, { op: "unlock", code: await otp(f.secret) });
  expect((await prisma.adminAuthenticator.findUniqueOrThrow({ where: { userId: f.admin.id } })).failedAttempts).toBe(0);
});
it("consumes recovery codes once, and regenerating requires an authenticator code", async () => {
  const f = await enroll(), second = await newSession(f.admin.id);
  await command(f.admin.id, second.id, { op: "unlock", code: f.codes[0].toLowerCase().replaceAll("-", " "), recovery: true });
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: f.codes[0], recovery: true })).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(command(f.admin.id, second.id, { op: "recovery-codes", code: f.codes[1] })).rejects.toMatchObject({ code: "VALIDATION" });
  advance(); const regenerated = await command(f.admin.id, second.id, { op: "recovery-codes", code: await otp(f.secret) });
  expect(regenerated).toHaveProperty("recoveryCodes");
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: f.codes[1], recovery: true })).rejects.toMatchObject({ code: "VALIDATION" });
});
it("expires admin access while retaining ordinary sign-in and blocks revoked sessions", async () => {
  const f = await enroll(); advance(ADMIN_UNLOCK_MS + 1);
  await inSession(f.admin.id, f.session.id, async () => {
    expect(await adminSecurityStatus(f.admin.id)).toMatchObject({ enrolled: true, unlocked: false });
    await expect(adminOverview(f.admin.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  expect(await prisma.session.findUnique({ where: { id: f.session.id } })).not.toBeNull();
  await command(f.admin.id, f.session.id, { op: "unlock", code: await otp(f.secret) });
  await prisma.session.delete({ where: { id: f.session.id } });
  await expect(command(f.admin.id, f.session.id, { op: "unlock", code: f.codes[0], recovery: true })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("replaces a factor only after both proofs and invalidates previous factors and other sessions", async () => {
  const f = await enroll(); advance(11 * 60_000);
  await expect(command(f.admin.id, f.session.id, { op: "enroll" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  const second = await newSession(f.admin.id, true);
  await expect(command(f.admin.id, second.id, { op: "enroll" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await command(f.admin.id, second.id, { op: "unlock", code: f.codes[0], recovery: true });
  const replacement = await command(f.admin.id, second.id, { op: "enroll" }), secret = enrollmentSecret(replacement);
  expect((await prisma.adminAuthenticator.findUniqueOrThrow({ where: { userId: f.admin.id } })).enabledAt).not.toBeNull();
  await command(f.admin.id, second.id, { op: "confirm", code: await otp(secret) });
  expect(await prisma.session.findUnique({ where: { id: f.session.id } })).toBeNull();
  advance();
  await expect(command(f.admin.id, second.id, { op: "unlock", code: await otp(f.secret) })).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(command(f.admin.id, second.id, { op: "unlock", code: f.codes[1], recovery: true })).rejects.toMatchObject({ code: "VALIDATION" });
  await command(f.admin.id, second.id, { op: "unlock", code: await otp(secret) });
});
it("denies unverified, suspended and other accounts even with a forged owner context", async () => {
  const f = await enroll();
  await inSession(f.admin.id, f.session.id, () => expect(executeAdminSecurity(f.other.id, { op: "lock" })).rejects.toMatchObject({ code: "FORBIDDEN" }));
  await prisma.user.update({ where: { id: f.admin.id }, data: { suspendedAt: new Date() } });
  await expect(command(f.admin.id, f.session.id, { op: "lock" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.user.update({ where: { id: f.admin.id }, data: { suspendedAt: null, emailVerified: false } });
  await expect(command(f.admin.id, f.session.id, { op: "lock" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("marks enrollment proof only after a successful real email-code sign-in, never password input", async () => {
  const call = (path: string, body: object, cookie = "") => auth.handler(new Request(`${origin}/api/auth/${path}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(body) }));
  const response = await call("sign-up/email", { name: "Tripanize.app", email: "admin@example.test", password: "Example-password-for-isolated-test!", adminEmailVerifiedAt: new Date().toISOString(), adminVerifiedUntil: new Date(Date.now() + ADMIN_UNLOCK_MS).toISOString() });
  expect(response.status).toBe(200);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "admin@example.test" } });
  expect((await prisma.session.findFirstOrThrow({ where: { userId: user.id } })).adminEmailVerifiedAt).toBeNull();
  let emailed = "";
  vi.stubEnv("RESEND_API_KEY", "isolated-no-network-key"); vi.stubEnv("SMTP_URL", "");
  vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => { emailed = JSON.parse(String(init?.body)).subject as string; return Response.json({ id: "isolated-fixture" }); }));
  expect((await call("email-otp/send-verification-otp", { email: user.email, type: "sign-in" })).status).toBe(200);
  const emailCode = emailed.match(/\b\d{6}\b/)![0];
  expect((await call("sign-in/email-otp", { email: user.email, otp: "wrong" })).ok).toBe(false);
  const signed = await call("sign-in/email-otp", { email: user.email, otp: emailCode }); expect(signed.status).toBe(200);
  const session = await prisma.session.findFirstOrThrow({ where: { userId: user.id, adminEmailVerifiedAt: { not: null } } });
  expect(session.adminVerifiedUntil).toBeNull();
  const cookie = signed.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const data = await (await auth.handler(new Request(`${origin}/api/auth/get-session`, { headers: { Cookie: cookie } }))).json() as { session: Record<string, unknown> };
  expect(data.session).not.toHaveProperty("adminEmailVerifiedAt"); expect(data.session).not.toHaveProperty("adminVerifiedUntil");
  await inSession(user.id, session.id, () => expect(executeAdminSecurity(user.id, { op: "enroll" })).resolves.toHaveProperty("uri"));
  requestState.headers = new Headers({ Cookie: cookie });
  await inSession(user.id, session.id, async () => {
    const request = (body: string) => new Request(`${origin}/api/account/security`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
    expect((await POST(request('{"op":"unlock","code":"123456","userId":"forged"}'))).status).toBe(400);
    expect((await POST(request(" ".repeat(2049)))).status).toBe(413);
    const prepared = await POST(request('{"op":"enroll"}'));
    expect(prepared.status).toBe(200); expect(prepared.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await prepared.json()).toHaveProperty("uri");
  });
});
it("protects the security API with origin, authentication, strict schema and a streamed body bound", async () => {
  const { admin, session } = await fixture();
  const request = (body: string, headers: Record<string, string> = {}) => new Request(`${origin}/api/account/security`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body });
  expect((await POST(request('{"op":"lock"}', { Origin: "https://outside.example.test" }))).status).toBe(403);
  expect((await POST(request('{"op":"lock"}'))).status).toBe(401);
  // A real signed auth cookie is exercised above; here the boundary must also
  // reject a trusted owner context when the actual HTTP session is missing.
  await inSession(admin.id, session.id, async () => {
    expect((await POST(request('{"op":"unlock","code":"123456","userId":"forged"}'))).status).toBe(401);
  });
  expect((await POST(request("{}", { "Content-Length": "2049" }))).status).toBe(413);
  expect(await prisma.adminAuthenticator.count()).toBe(0);
});

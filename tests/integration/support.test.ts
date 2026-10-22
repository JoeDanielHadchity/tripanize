import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { prisma } from "@/server/db";
import { POST } from "@/app/api/support/route";
import { supportConfigured } from "@/server/support/service";
import { resetDb } from "./helpers";

const runtime = currentRuntime();
const origin = "https://tripanize.example.test";
const data = () => ({ name: "Traveler", email: "traveler@example.test", topic: "technical", message: "My itinerary does not load. Please help.", website: "", requestId: randomUUID() });
function request(body: unknown = data(), options: { origin?: string; ip?: string; contentType?: string } = {}) {
  return new Request(origin + "/api/support", { method: "POST", headers: { Origin: options.origin ?? origin, "Content-Type": options.contentType ?? "application/json", "CF-Connecting-IP": options.ip ?? "192.0.2.1" }, body: JSON.stringify(body) });
}
beforeEach(async () => {
  await resetDb();
  setTestRuntime({ ...runtime, supportEmail: "operator@example.test" });
  vi.stubEnv("RESEND_API_KEY", "isolated-not-a-real-key");
  vi.stubEnv("SMTP_URL", "");
  vi.stubEnv("EMAIL_FROM", "Tripanize <hello@example.test>");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "isolated-message" })));
});
afterEach(() => { setTestRuntime(runtime); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("sends only to the private configured operator, preserves a safe reply address and keeps submitted HTML as plain text", async () => {
  const input = { ...data(), name: "<img src=x onerror=alert(1)>", message: "<script>example</script> This is a support message." };
  const result = await POST(request(input));
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ sent: true, reference: input.requestId });
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  const calls = vi.mocked(fetch).mock.calls;
  expect(calls).toHaveLength(1);
  const sent = JSON.parse(String(calls[0][1]?.body));
  expect(sent).toMatchObject({ to: ["operator@example.test"], reply_to: input.email, from: "Tripanize <hello@example.test>" });
  expect(sent.html).toBeUndefined();
  expect(sent.subject).not.toContain(input.name);
  expect(sent.text).toContain(input.message);
  const saved = await prisma.rateLimitHit.findMany();
  expect(saved).toHaveLength(3);
  expect(JSON.stringify(saved)).not.toMatch(/traveler@example|192\.0\.2\.1/);
});
it("uses one provider idempotency key for exact retries and a different key after editing the content", async () => {
  const input = data();
  await POST(request(input)); await POST(request(input));
  await POST(request({ ...input, message: input.message + " Additional detail." }));
  const keys = vi.mocked(fetch).mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
  expect(keys[0]).toBe(keys[1]); expect(keys[2]).not.toBe(keys[0]);
});
it("rejects cross-origin, malformed, oversized and non-JSON submissions before email delivery", async () => {
  expect((await POST(request(data(), { origin: "https://outside.example" }))).status).toBe(403);
  expect((await POST(request(data(), { contentType: "text/plain" }))).status).toBe(400);
  expect((await POST(new Request(origin + "/api/support", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "invalid json" }))).status).toBe(400);
  expect((await POST(request({ ...data(), message: "x".repeat(21_000) }))).status).toBe(413);
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects recipient injection, header injection, honeypot input and invalid fields", async () => {
  const invalid = [
    { ...data(), to: "attacker@example.test" },
    { ...data(), email: "traveler@example.test\r\nBcc: attacker@example.test" },
    { ...data(), website: "https://spam.example" },
    { ...data(), topic: "made-up" },
    { ...data(), message: "short" },
    { ...data(), requestId: "not-a-uuid" },
  ];
  for (const input of invalid) expect((await POST(request(input))).status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
  expect(await prisma.rateLimitHit.count()).toBe(0);
});
it("does not claim delivery when the provider rejects or times out, and never exposes provider errors", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json({ message: "private-provider-error" }, { status: 500 }));
  const rejected = await POST(request()); expect(rejected.status).toBe(503);
  expect(await rejected.text()).not.toContain("private-provider-error");
  vi.mocked(fetch).mockRejectedValueOnce(new Error("private-network-error"));
  const failed = await POST(request()); expect(failed.status).toBe(503);
  expect(await failed.text()).not.toContain("private-network-error");
});
it("disables support when its private recipient or email provider is missing", async () => {
  setTestRuntime(runtime); expect(supportConfigured()).toBe(false);
  expect((await POST(request())).status).toBe(503);
  setTestRuntime({ ...runtime, supportEmail: "operator@example.test" }); vi.stubEnv("RESEND_API_KEY", "");
  expect(supportConfigured()).toBe(false);
  expect((await POST(request())).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it("limits a source IP even when reply addresses change, and limits a reply address across different IPs", async () => {
  for (let i = 0; i < 4; i++) expect((await POST(request({ ...data(), email: `traveler${i}@example.test` }))).status).toBe(200);
  expect((await POST(request(data()))).status).toBe(429);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(4);
  await resetDb(); vi.mocked(fetch).mockClear();
  for (let i = 0; i < 5; i++) expect((await POST(request(data(), { ip: `192.0.2.${i + 2}` }))).status).toBe(200);
  expect((await POST(request(data(), { ip: "192.0.2.100" }))).status).toBe(429);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(5);
});

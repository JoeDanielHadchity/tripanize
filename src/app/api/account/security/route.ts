import { noStore, withUser } from "@/server/api";
import { adminSecurityCommand, executeAdminSecurity } from "@/server/admin/security";
import { currentRuntime } from "@/server/cloudflare/runtime";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { ...noStore, "Referrer-Policy": "no-referrer" } });
export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "JSON is required." }, 415);
  if (Number(request.headers.get("Content-Length") ?? 0) > 2048) return json({ error: "Request is too large." }, 413);
  const result = await withUser(async userId => {
    // Only the trusted signed-in owner can even submit verification payloads.
    const context = currentRuntime().accountMode;
    if (!context?.sessionId || context.userId !== userId) return json({ error: "Admin security is only available to the verified administrator account." }, 403);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Missing request." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); return json({ error: "Request is too large." }, 413); }
      chunks.push(value);
    }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return json({ error: "Invalid verification request." }, 400); }
    const command = adminSecurityCommand.safeParse(input);
    if (!command.success) return json({ error: "Invalid verification request." }, 400);
    return json(await executeAdminSecurity(userId, command.data));
  });
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  result.headers.set("Referrer-Policy", "no-referrer");
  return result;
}

import { revalidatePath } from "next/cache";
import { withUser, noStore } from "@/server/api";
import { AppError } from "@/server/errors";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { setAccountMode } from "@/server/admin/mode";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
export async function POST(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  if (Number(request.headers.get("Content-Length") ?? 0) > 1024) return json({ error: "Invalid mode request." }, 413);
  const response = await withUser(async userId => {
    const session = currentRuntime().accountMode;
    if (!session?.sessionId || session.userId !== userId) throw new AppError("FORBIDDEN", "This switch is only available to the verified administrator account.");
    const text = await request.text();
    if (text.length > 1024) throw new AppError("VALIDATION", "Invalid mode request.");
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new AppError("VALIDATION", "Choose a mode."); }
    if (!value || typeof value !== "object" || Object.keys(value).length !== 1 || !("mode" in value) || typeof value.mode !== "string" || !["ADMIN", "NORMAL"].includes(value.mode)) throw new AppError("VALIDATION", "Choose Admin or Normal mode.");
    const data = await setAccountMode(userId, (value as { mode: "ADMIN" | "NORMAL" }).mode);
    revalidatePath("/", "layout");
    return json({ ok: true, data });
  });
  response.headers.set("Cache-Control", noStore["Cache-Control"]);
  return response;
}

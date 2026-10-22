import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { noStore, withUser } from "@/server/api";
import { assistantCommand } from "@/server/assistant/schema";
import { applyAssistantChanges, cancelAssistantReply, dismissAssistantProposal, getAssistantConversation, sendAssistantMessage } from "@/server/assistant/service";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStore });
export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const result = await withUser(async userId => json(await getAssistantConversation(userId, tripId)));
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  return result;
}
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ error: "JSON is required." }, 415);
  if (Number(request.headers.get("Content-Length") ?? 0) > 20_000) return json({ error: "Message is too large." }, 413);
  const { tripId } = await params;
  const result = await withUser(async userId => {
    const text = await request.text();
    if (text.length > 20_000) return json({ error: "Message is too large." }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: "Invalid JSON." }, 400); }
    const parsed = assistantCommand.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid assistant request. Messages can contain up to 3,000 characters." }, 400);
    const input = parsed.data;
    if (input.op === "send") await sendAssistantMessage(userId, tripId, input);
    else if (input.op === "cancel") await cancelAssistantReply(userId, tripId, input.id);
    else if (input.op === "dismiss") await dismissAssistantProposal(userId, tripId, input.id);
    else { await applyAssistantChanges(userId, tripId, input.id); revalidatePath(`/trips/${tripId}`, "layout"); }
    return json(await getAssistantConversation(userId, tripId));
  });
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  return result;
}

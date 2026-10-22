import { NextResponse } from "next/server";
import { withUser, noStore } from "@/server/api";
import { chatCommand, deleteChatMessage, getChatPage, getChatSummary, markChatRead, sendChatMessage } from "@/server/chat/service";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStore });
export async function GET(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const query = new URL(request.url).searchParams;
  const result = await withUser(async userId => {
    if (query.has("summary")) return json(await getChatSummary(userId, tripId));
    return json(await getChatPage(userId, tripId, { ...(query.has("before") ? { before: Number(query.get("before")) } : {}), ...(query.has("since") ? { since: Number(query.get("since")) } : {}) }));
  });
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
    const parsed = chatCommand.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid chat request. Messages can contain up to 4,000 characters." }, 400);
    const input = parsed.data;
    if (input.op === "send") return json(await sendChatMessage(userId, tripId, { clientId: input.clientId, body: input.body }));
    if (input.op === "delete") return json(await deleteChatMessage(userId, tripId, input.id));
    return json(await markChatRead(userId, tripId, input.seq));
  });
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  return result;
}

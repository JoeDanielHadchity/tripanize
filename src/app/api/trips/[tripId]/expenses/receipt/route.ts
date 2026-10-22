import { noStore, withUser } from "@/server/api";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { extractReceipt, RECEIPT_MAX_BYTES } from "@/server/expenses/receipt";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) return json({ error: "Choose a receipt file." }, 415);
  const limit = RECEIPT_MAX_BYTES + 64 * 1024;
  if (Number(request.headers.get("Content-Length") ?? 0) > limit) return json({ error: "Choose a receipt up to 8 MB." }, 413);
  const { tripId } = await params;
  const result = await withUser(async userId => {
    await requireTrip(tripId, userId, "edit");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "Choose a receipt file.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); return json({ error: "Choose a receipt up to 8 MB." }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    let form: FormData;
    try { form = await new Response(body, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new AppError("VALIDATION", "Couldn't open this upload. Choose the receipt again."); }
    const file = form.get("receipt");
    if (!(file instanceof File) || [...form.keys()].length !== 1) throw new AppError("VALIDATION", "Choose one receipt file at a time.");
    return json({ draft: await extractReceipt(userId, tripId, file, request.signal) });
  });
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  return result;
}

import { noStore, withUser } from "@/server/api";
import { requirePremiumTrip } from "@/server/plans/access";
import { AppError } from "@/server/errors";
import { MAX_ATTACHMENT_BYTES } from "@/server/storage";
import { scanExpenseReceipt } from "@/server/expenses/scan";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) return json({ error: "Choose a receipt." }, 415);
  const limit = MAX_ATTACHMENT_BYTES + 128 * 1024;
  if (Number(request.headers.get("Content-Length") ?? 0) > limit) return json({ error: "Scan one receipt up to 10 MB." }, 413);
  const { tripId } = await params;
  const response = await withUser(async userId => {
    await requirePremiumTrip(tripId, userId, "expenses", "edit");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "Choose a receipt.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); return json({ error: "Scan one receipt up to 10 MB." }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    let form: FormData;
    try { form = await new Response(body, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new AppError("VALIDATION", "Couldn't read this upload. Choose the receipt again."); }
    if ([...form.keys()].some(key => !["receipt", "attachmentId"].includes(key))) throw new AppError("VALIDATION", "Invalid scan request.");
    const file = form.get("receipt"), id = form.get("attachmentId");
    if (form.getAll("receipt").length + form.getAll("attachmentId").length !== 1 || !(file instanceof File || typeof id === "string")) throw new AppError("VALIDATION", "Choose one receipt to scan.");
    const data = await scanExpenseReceipt(userId, tripId, file instanceof File ? file : id as string);
    return json({ ok: true, data });
  });
  response.headers.set("Cache-Control", noStore["Cache-Control"]);
  return response;
}

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { noStore, withUser } from "@/server/api";
import { requireTrip } from "@/server/auth/permissions";
import { AppError } from "@/server/errors";
import { expenseInput } from "@/server/expenses/service";
import { saveExpenseWithReceipts } from "@/server/expenses/receipts";
import { MAX_ATTACHMENT_BYTES } from "@/server/storage";

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: noStore });
const commandSchema = z.object({
  id: z.string().min(1).max(64).nullable(), version: z.number().int().nonnegative(), input: expenseInput,
  removeIds: z.array(z.string().min(1).max(64)).max(5),
});
export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin) return json({ error: "Request origin is not allowed." }, 403);
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.startsWith("multipart/form-data;")) return json({ error: "Submit the payment form." }, 415);
  const limit = MAX_ATTACHMENT_BYTES + 128 * 1024;
  if (Number(request.headers.get("Content-Length") ?? 0) > limit) return json({ error: "Attach up to 10 MB of new receipts at a time." }, 413);
  const { tripId } = await params;
  const result = await withUser(async userId => {
    await requireTrip(tripId, userId, "edit");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "Submit the payment form.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); return json({ error: "Attach up to 10 MB of new receipts at a time." }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    let form: FormData;
    try { form = await new Response(body, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new AppError("VALIDATION", "Couldn't read this upload. Choose your receipts again."); }
    if ([...form.keys()].some(key => !["command", "receipts"].includes(key))) throw new AppError("VALIDATION", "Invalid payment form.");
    const value = form.get("command");
    if (typeof value !== "string" || value.length > 64_000 || form.getAll("command").length !== 1) throw new AppError("VALIDATION", "Invalid payment details.");
    let raw: unknown;
    try { raw = JSON.parse(value); } catch { throw new AppError("VALIDATION", "Invalid payment details."); }
    const command = commandSchema.safeParse(raw);
    if (!command.success) throw new AppError("VALIDATION", "Check the payment details and try again.");
    const files = form.getAll("receipts");
    if (files.some(file => !(file instanceof File))) throw new AppError("VALIDATION", "Choose a receipt file.");
    const { id, input, version, removeIds } = command.data;
    const saved = await saveExpenseWithReceipts(userId, tripId, id, input, version, files as File[], removeIds);
    revalidatePath(`/trips/${tripId}`, "layout");
    return json({ ok: true, data: saved });
  });
  result.headers.set("Cache-Control", noStore["Cache-Control"]);
  return result;
}

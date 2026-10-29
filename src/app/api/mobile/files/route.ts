import { z } from "zod";
import { mobileRead, mobileOriginAllowed } from "@/server/mobile/api";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { requirePremiumTrip } from "@/server/plans/access";
import { exportTripJson, exportTripPdf } from "@/server/export";
import { MAX_ATTACHMENT_BYTES, readAttachment, saveAttachment } from "@/server/storage";
import { expenseInput } from "@/server/expenses/service";
import { saveExpenseWithReceipts } from "@/server/expenses/receipts";
import { scanExpenseReceipt } from "@/server/expenses/scan";
import { rateLimit } from "@/server/ratelimit";

const id = z.string().min(1).max(64);
export async function GET(request: Request) {
  return mobileRead(request, async userId => {
    const query = new URL(request.url).searchParams;
    if (query.has("attachmentId")) {
      const file = await readAttachment(userId, id.parse(query.get("attachmentId")));
      const fileName = file.meta.fileName.replace(/[^\w. -]/g, "_");
      return new Response(Uint8Array.from(file.data), { headers: { "Content-Type": file.meta.mimeType, "Content-Disposition": `attachment; filename="${fileName}"` } });
    }
    const tripId = id.parse(query.get("tripId"));
    await requireTrip(tripId, userId);
    await rateLimit(`mobile-export:${userId}`, 30, 3600);
    if (query.get("kind") === "json") return new Response(JSON.stringify(await exportTripJson(userId, tripId), null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="Tripanize-trip.json"' } });
    if (query.get("kind") !== "pdf") throw new AppError("VALIDATION", "Choose PDF or JSON.");
    return new Response(Uint8Array.from(await exportTripPdf(userId, tripId, {})), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="Tripanize-trip.pdf"' } });
  });
}
export async function POST(request: Request) {
  return mobileRead(request, async userId => {
    if (!mobileOriginAllowed(request)) throw new AppError("FORBIDDEN", "Request origin is not allowed.");
    const tripId = id.parse(new URL(request.url).searchParams.get("tripId"));
    await requireTrip(tripId, userId, "edit");
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.startsWith("multipart/form-data;")) throw new AppError("VALIDATION", "Choose an image or PDF.");
    const limit = MAX_ATTACHMENT_BYTES + 128 * 1024;
    if (Number(request.headers.get("Content-Length") ?? 0) > limit) throw new AppError("VALIDATION", "Attach up to 10 MB at a time.");
    const reader = request.body?.getReader();
    if (!reader) throw new AppError("VALIDATION", "Choose a file.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > limit) { await reader.cancel(); throw new AppError("VALIDATION", "Attach up to 10 MB at a time."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let form: FormData;
    try { form = await new Response(bytes, { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new AppError("VALIDATION", "Could not read this upload. Select the files again."); }
    const op = z.enum(["expense", "booking", "scan"]).parse(form.get("op"));
    const files = form.getAll("files");
    if (files.length > 5 || files.some(file => !(file instanceof File) || !file.size)) throw new AppError("VALIDATION", "Choose up to five receipt files.");
    await rateLimit(`mobile-upload:${userId}`, 60, 3600);
    if (op === "scan") {
      await requirePremiumTrip(tripId, userId, "expenses", "edit");
      if (files.length !== 1) throw new AppError("VALIDATION", "Scan one receipt at a time.");
      return { scan: await scanExpenseReceipt(userId, tripId, files[0] as File) };
    }
    const raw = form.get("values");
    if (typeof raw !== "string" || raw.length > 96000) throw new AppError("VALIDATION", "Invalid form.");
    let values: unknown;
    try { values = JSON.parse(raw); } catch { throw new AppError("VALIDATION", "Invalid form."); }
    if (op === "booking") {
      const command = z.object({ id }).parse(values);
      if (files.length !== 1) throw new AppError("VALIDATION", "Attach one booking document at a time.");
      for (const file of files) await saveAttachment(userId, tripId, command.id, file as File);
      return { refresh: true, message: "Documents attached." };
    }
    await requirePremiumTrip(tripId, userId, "expenses", "edit");
    const c = z.object({ id: id.nullable(), version: z.number().int().nonnegative(), removeIds: z.array(id).max(5).default([]) }).parse(values);
    await saveExpenseWithReceipts(userId, tripId, c.id, expenseInput.parse(values), c.version, files as File[], c.removeIds);
    return { to: { screen: "expenses", tripId } };
  });
}

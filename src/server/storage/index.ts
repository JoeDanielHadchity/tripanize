import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { recordChange } from "@/server/audit";

/**
 * Private attachment storage on the server's disk, outside the public web root. Files are only served through an
 * authenticated route that checks trip membership. For multi-instance hosting, swap this driver for an object store
 * with private buckets and short-lived signed URLs.
 */
const ROOT = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export async function saveAttachment(userId: string, tripId: string, bookingId: string, file: File) {
  await requireTrip(tripId, userId, "edit");
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, tripId } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
  if (file.size > MAX_BYTES) throw new AppError("VALIDATION", "Files can be up to 10 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime || !ALLOWED[mime]) throw new AppError("VALIDATION", "Upload a PDF, PNG, JPEG or WebP file.");
  const key = `${tripId}/${randomBytes(16).toString("hex")}.${ALLOWED[mime]}`;
  await mkdir(/*turbopackIgnore: true*/ path.join(ROOT, tripId), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ path.join(ROOT, key), buf, { mode: 0o600 });
  const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || `ticket.${ALLOWED[mime]}`;
  return prisma.$transaction(async (tx) => {
    const a = await tx.attachment.create({ data: { tripId, bookingId, fileName: name, mimeType: mime, sizeBytes: buf.length, storageKey: key, uploadedById: userId } });
    await recordChange(tx, { tripId, actorId: userId, entity: "attachment", entityId: a.id, action: "create", after: { bookingId, fileName: name } });
    return a;
  });
}

export async function readAttachment(userId: string, attachmentId: string) {
  const a = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) throw new AppError("NOT_FOUND", "File not found.");
  await requireTrip(a.tripId, userId, "view");
  const full = path.join(/*turbopackIgnore: true*/ ROOT, a.storageKey);
  if (!full.startsWith(ROOT + path.sep)) throw new AppError("NOT_FOUND", "File not found.");
  return { meta: a, data: await readFile(/*turbopackIgnore: true*/ full) };
}

export async function deleteAttachment(userId: string, tripId: string, attachmentId: string) {
  await requireTrip(tripId, userId, "edit");
  const a = await prisma.attachment.findFirst({ where: { id: attachmentId, tripId } });
  if (!a) throw new AppError("NOT_FOUND", "File not found.");
  await prisma.$transaction(async (tx) => {
    await tx.attachment.delete({ where: { id: a.id } });
    await recordChange(tx, { tripId, actorId: userId, entity: "attachment", entityId: a.id, action: "delete" });
  });
  await unlink(/*turbopackIgnore: true*/ path.join(ROOT, a.storageKey)).catch(() => undefined);
}

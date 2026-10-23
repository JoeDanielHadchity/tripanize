import { randomBytes } from "node:crypto";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { requireTrip } from "@/server/auth/permissions";
import { requirePremiumAccess } from "@/server/plans/access";
import { recordChange } from "@/server/audit";

/** Private R2 objects are served only after checking trip membership. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function sniffAttachment(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString() === "PNG") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export type UploadedFile = { fileName: string; mimeType: string; sizeBytes: number; storageKey: string };

/** Call only after authorization; metadata is linked in the caller's transaction. */
export async function uploadPrivateFile(tripId: string, file: File): Promise<UploadedFile> {
  if (!file.size || file.size > MAX_ATTACHMENT_BYTES) throw new AppError("VALIDATION", "Choose a file up to 10 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffAttachment(buf);
  if (!mime || !ALLOWED[mime] || (file.type && file.type !== mime && file.type !== "application/octet-stream")) throw new AppError("VALIDATION", "Upload a PDF, PNG, JPEG or WebP file that matches its format.");
  const key = `${tripId}/${randomBytes(16).toString("hex")}.${ALLOWED[mime]}`;
  const files = currentRuntime().files;
  if (!files) throw new AppError("NOT_CONFIGURED", "File storage is not configured.");
  await files.put(key, buf, { httpMetadata: { contentType: mime } });
  const name = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || `receipt.${ALLOWED[mime]}`;
  return { fileName: name, mimeType: mime, sizeBytes: buf.length, storageKey: key };
}

export async function cleanupPrivateFiles(keys: string[]) {
  for (const key of keys) await currentRuntime().files?.delete(key).catch(() => console.warn("[storage] An unreferenced upload needs cleanup."));
}

export async function saveAttachment(userId: string, tripId: string, bookingId: string, file: File) {
  await requireTrip(tripId, userId, "edit");
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, tripId } });
  if (!booking) throw new AppError("NOT_FOUND", "Booking not found.");
  const upload = await uploadPrivateFile(tripId, file);
  try {
    return await prisma.$transaction(async (tx) => {
      const a = await tx.attachment.create({ data: { tripId, bookingId, ...upload, uploadedById: userId } });
      await recordChange(tx, { tripId, actorId: userId, entity: "attachment", entityId: a.id, action: "create", after: { bookingId, fileName: upload.fileName } });
      return a;
    });
  } catch (error) {
    await cleanupPrivateFiles([upload.storageKey]);
    throw error;
  }
}

export async function readAttachment(userId: string, attachmentId: string) {
  const a = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) throw new AppError("NOT_FOUND", "File not found.");
  await requireTrip(a.tripId, userId, "view");
  if (a.expenseId) await requirePremiumAccess(a.tripId, "expenses");
  if (a.expenseId && !await prisma.expense.findFirst({ where: { id: a.expenseId, tripId: a.tripId, deletedAt: null }, select: { id: true } })) throw new AppError("NOT_FOUND", "Payment not found.");
  const file = await currentRuntime().files?.get(a.storageKey);
  if (!file) throw new AppError("NOT_FOUND", "File not found.");
  return { meta: a, data: Buffer.from(await file.arrayBuffer()) };
}

export async function deleteAttachment(userId: string, tripId: string, attachmentId: string) {
  await requireTrip(tripId, userId, "edit");
  const a = await prisma.attachment.findFirst({ where: { id: attachmentId, tripId } });
  if (!a) throw new AppError("NOT_FOUND", "File not found.");
  await prisma.$transaction(async (tx) => {
    if (a.expenseId) await requirePremiumAccess(tripId, "expenses", tx);
    await tx.attachment.delete({ where: { id: a.id } });
    await recordChange(tx, { tripId, actorId: userId, entity: "attachment", entityId: a.id, action: "delete" });
  });
  // Metadata deletion has committed. A transient R2 failure must not report the
  // successful deletion as an unchanged booking; the orphan remains private.
  await currentRuntime().files?.delete(a.storageKey).catch(() => console.warn("[storage] An unreferenced upload needs cleanup."));
}

import { readAttachment } from "@/server/storage";
import { noStore, withUser } from "@/server/api";

/** Serves a ticket/attachment only to members of its trip. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withUser(async (userId) => {
    const { meta, data } = await readAttachment(userId, id);
    return new Response(new Uint8Array(data), {
      headers: { ...noStore, "Content-Type": meta.mimeType, "Content-Disposition": `inline; filename="${meta.fileName.replace(/"/g, "")}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" },
    });
  });
}

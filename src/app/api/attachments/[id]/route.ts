import { readAttachment } from "@/server/storage";
import { noStore, withUser } from "@/server/api";

/** Serves a ticket/attachment only to members of its trip. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const response = await withUser(async (userId) => {
    const { meta, data } = await readAttachment(userId, id);
    return new Response(new Uint8Array(data), {
      headers: { ...noStore, "Content-Type": meta.mimeType, "Content-Disposition": `${new URL(req.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${meta.fileName.replace(/"/g, "")}"`, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" },
    });
  });
  response.headers.set("Cache-Control", noStore["Cache-Control"]);
  return response;
}

import { currentRuntime } from "@/server/cloudflare/runtime";
import { IDEA_PHOTO_PREFIX } from "@/server/examples/trip-ideas";

/** Public trip idea photos uploaded on the Company page. Names are random and never reused. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[a-z0-9-]{8,80}\.(webp|jpg|png)$/.test(name)) return new Response("Not found", { status: 404 });
  const file = await currentRuntime().files?.get(IDEA_PHOTO_PREFIX + name);
  if (!file) return new Response("Not found", { status: 404 });
  const type = name.endsWith(".png") ? "image/png" : name.endsWith(".jpg") ? "image/jpeg" : "image/webp";
  return new Response(await file.arrayBuffer(), { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}

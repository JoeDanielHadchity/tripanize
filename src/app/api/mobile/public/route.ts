import { publicMobileGuide, publicMobileHome } from "@/server/mobile/public";

/** Public GET-only catalog; never dispatches arbitrary workspace screens. */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const headers = { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" };
  if ([...params.keys()].some(key => key !== "guide") || params.getAll("guide").length > 1) return Response.json({ error: "Unknown public page." }, { status: 400, headers: { ...headers, "Cache-Control": "no-store" } });
  const result = params.has("guide") ? publicMobileGuide(params.get("guide")!) : publicMobileHome();
  return result ? Response.json(result, { headers }) : Response.json({ error: "Example not found." }, { status: 404, headers: { ...headers, "Cache-Control": "no-store" } });
}

import { currentRuntime } from "@/server/cloudflare/runtime";

/** Which sign-in options the app should show. Public and cacheable briefly. */
export async function GET() {
  return Response.json({ google: Boolean(currentRuntime().google) }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}

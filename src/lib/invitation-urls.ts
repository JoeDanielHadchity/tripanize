/** Keep shared invitations on one production host without changing local previews. */
export function invitationOrigin(appUrl: string) {
  const url = new URL(appUrl);
  if (url.hostname === "tripanize.app") url.hostname = "www.tripanize.app";
  return url.origin;
}

/** Older links keep their token and query when opened on the bare domain. */
export function invitationRedirect(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.hostname !== "tripanize.app" || !/^\/(invite|trial)\/[^/]+\/?$/.test(url.pathname)) return null;
  url.hostname = "www.tripanize.app";
  return new Response(null, { status: 307, headers: { Location: url.href, "Cache-Control": "private, no-store" } });
}

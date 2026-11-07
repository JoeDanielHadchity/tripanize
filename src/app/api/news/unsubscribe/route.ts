import { setNewsEmails, verifyUnsubscribe } from "@/server/admin/broadcasts";

const page = (title: string, body: string) => new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Tripanize</title></head><body style="font-family:system-ui,sans-serif;background:#f6f2e9;color:#172e33;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:24px">${title}</h1>${body}</main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
function read(url: URL) { const u = url.searchParams.get("u") ?? "", s = url.searchParams.get("s") ?? ""; return u && s && u.length <= 80 && verifyUnsubscribe(u, s) ? u : null; }

/** Shows a button: link scanners in mail apps open links, so a GET never unsubscribes by itself. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!read(url)) return page("Link not valid", "<p>This unsubscribe link isn't valid. You can turn Tripanize news off in your account settings.</p>");
  return page("Stop Tripanize news?", `<p>You won't get news emails any more. Trip emails you turned on (like change alerts) are not affected.</p><form method="post" action="${esc(url.pathname + url.search)}"><button style="margin-top:12px;background:#0b6e74;color:#fff;border:0;border-radius:24px;padding:12px 22px;font-size:16px;font-weight:600;cursor:pointer">Unsubscribe</button></form>`);
}

/** The button above, and one-click unsubscribe from mail apps. */
export async function POST(request: Request) {
  const userId = read(new URL(request.url));
  if (!userId) return page("Link not valid", "<p>This unsubscribe link isn't valid.</p>");
  await setNewsEmails(userId, false).catch(() => undefined);
  return page("You're unsubscribed", "<p>You won't receive Tripanize news emails. You can turn them back on in your account settings any time.</p>");
}

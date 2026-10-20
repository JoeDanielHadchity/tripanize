// TEST HARNESS ONLY — never used by the app in production.
// Stand-in for Resend's POST /emails so code sign-in can be tested end to end where api.resend.com is
// unreachable. Run the app with RESEND_API_URL=http://localhost:4011/emails. GET /last?to=<email>
// returns the most recent message sent to that address.
import http from "node:http";

const inbox = new Map();
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/last") {
    const m = inbox.get(String(url.searchParams.get("to")).toLowerCase());
    res.writeHead(m ? 200 : 404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(m ?? { error: "none" }));
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = JSON.parse(body || "{}");
    if (!String(req.headers.authorization).startsWith("Bearer ") || !json.from || !json.to?.length) {
      res.writeHead(422, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ statusCode: 422, message: "Missing API key, from or to" }));
    }
    const id = `stub_${Date.now()}`;
    for (const to of json.to) inbox.set(String(to).toLowerCase(), { id, ...json });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id }));
  });
}).listen(Number(process.env.PORT ?? 4011), () => console.log("resend stub listening"));

// TEST HARNESS ONLY — never used by the app in production.
// Minimal stand-in for the OpenAI Responses API so the planning UI (review → accept → versions → swap) can be
// exercised end to end where api.openai.com is unreachable. Start the worker with OPENAI_BASE_URL pointing here.
import http from "node:http";

const stop = (title, startTime, durationMin, extra = {}) => ({
  title, category: "sight", locationName: title, address: "Lisbon", lat: 38.7, lng: -9.14, reason: "Stub content for UI testing.", startTime, durationMin,
  travelToNextMin: 15, travelMode: "walking", travelNote: null, estCost: 10, bookingRequired: false, bookingNote: null, hoursNote: "Stub — not verified", hoursVerified: false,
  officialUrl: null, sourceUrls: [], isMeal: false, isFreeTime: false, indoor: null, ...extra,
});

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const json = JSON.parse(body || "{}");
    const name = json.text?.format?.name;
    let data;
    if (name === "swap") data = { alternatives: [stop("Stub alternative A", "09:00", 60), stop("Stub alternative B", "09:00", 45)], note: null };
    else if (name === "events") data = { events: [] };
    else {
      const m = String(json.input).match(/<trip_data>\n([\s\S]*)\n<\/trip_data>/);
      const dates = m ? JSON.parse(m[1]).datesToPlan : [];
      data = {
        summary: "Stub plan used to test the review flow.", unplacedMustSees: [], generalNotes: [],
        days: dates.map((date, i) => ({ date, area: "Centre", title: `Stub day ${i + 1}`, isTravelDay: false, driveMinutes: null, planBNote: "Indoor option", notes: ["Stub note"], questions: [], estCost: 30,
          stops: [stop(`Stub museum ${i + 1}`, "10:00", 90), stop(`Stub lunch ${i + 1}`, "12:30", 60, { isMeal: true, category: "food" })],
          planB: [stop(`Stub indoor ${i + 1}`, "10:00", 120, { indoor: true })] })),
      };
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "resp_stub", object: "response", created_at: Date.now() / 1000, status: "completed", model: "stub", output: [{ type: "message", id: "msg_stub", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(data), annotations: [] }] }], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }));
  });
}).listen(4010, () => console.log("openai stub on :4010"));

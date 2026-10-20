import { describe, expect, it } from "vitest";
import { checkProposal } from "@/server/planner/checks";
import type { PlanStop, Proposal } from "@/server/planner/schema";

const stop = (title: string, startTime: string, durationMin = 60, extra: Partial<PlanStop> = {}): PlanStop => ({
  title, category: "sight", locationName: null, address: null, lat: null, lng: null, reason: "Nice", startTime, durationMin, travelToNextMin: 15, travelMode: "walking", travelNote: null, estCost: 10, bookingRequired: false, bookingNote: null, hoursNote: null, hoursVerified: false, officialUrl: null, sourceUrls: [], isMeal: false, isFreeTime: false, indoor: null, ...extra,
});

const day = (date: string, stops: PlanStop[], extra = {}) => ({ date, area: "Centre", title: "Day", isTravelDay: false, driveMinutes: null, stops, planB: [], planBNote: null, notes: [], questions: [], estCost: null, ...extra });

describe("checkProposal", () => {
  const base = { anchors: [], mustSee: [], arrivalAt: null, departureAt: null };

  it("drops dates outside the request and flags missing dates", () => {
    const p: Proposal = { summary: "", unplacedMustSees: [], generalNotes: [], days: [day("2026-05-01", [stop("A", "09:00")]), day("2026-06-30", [stop("B", "09:00")])] };
    const r = checkProposal(p, { ...base, dates: ["2026-05-01", "2026-05-02"] });
    expect(r.proposal.days.map((d) => d.date)).toEqual(["2026-05-01"]);
    expect(r.issues.some((i) => i.date === "2026-05-02" && i.severity === "conflict")).toBe(true);
  });

  it("flags overlaps with fixed commitments instead of moving them", () => {
    const p: Proposal = { summary: "", unplacedMustSees: [], generalNotes: [], days: [day("2026-05-01", [stop("Louvre", "13:00", 180)])] };
    const r = checkProposal(p, { ...base, dates: ["2026-05-01"], anchors: [{ ref: "x", date: "2026-05-01", title: "Wedding", startTime: "15:00", durationMin: 240, kind: "fixed commitment", status: "CONFIRMED", address: null }] });
    expect(r.issues.find((i) => i.severity === "conflict")?.message).toMatch(/Wedding/);
  });

  it("never silently drops a must-see", () => {
    const p: Proposal = { summary: "", unplacedMustSees: [{ name: "Versailles", reason: "Closed Mondays", options: ["Go Tuesday"] }], generalNotes: [], days: [day("2026-05-01", [stop("Eiffel Tower summit", "10:00")])] };
    const r = checkProposal(p, { ...base, dates: ["2026-05-01"], mustSee: ["Eiffel Tower", "Versailles", "Musée d'Orsay"] });
    const msgs = r.issues.map((i) => i.message).join("\n");
    expect(msgs).not.toMatch(/Eiffel/);
    expect(msgs).not.toMatch(/Versailles/);
    expect(msgs).toMatch(/Orsay/);
  });

  it("removes booked claims and unsafe links", () => {
    const p: Proposal = { summary: "", unplacedMustSees: [], generalNotes: [], days: [day("2026-05-01", [stop("Show", "20:00", 120, { bookingNote: "Your tickets are already booked.", officialUrl: "javascript:alert(1)", sourceUrls: ["https://ok.example", "ftp://x"] })])] };
    const r = checkProposal(p, { ...base, dates: ["2026-05-01"] });
    const s = r.proposal.days[0].stops[0];
    expect(s.bookingNote).not.toMatch(/already booked/);
    expect(s.officialUrl).toBeNull();
    expect(s.sourceUrls).toEqual(["https://ok.example/"]);
  });

  it("respects arrival and departure and long drive days", () => {
    const p: Proposal = {
      summary: "", unplacedMustSees: [], generalNotes: [],
      days: [day("2026-05-01", [stop("Early museum", "10:00")]), day("2026-05-02", [stop("A", "09:00", 120), stop("B", "12:00", 120), stop("C", "15:00", 120)], { driveMinutes: 300 }), day("2026-05-03", [stop("Late lunch", "13:00", 90)])],
    };
    const r = checkProposal(p, { ...base, dates: ["2026-05-01", "2026-05-02", "2026-05-03"], arrivalAt: "2026-05-01T10:30", departureAt: "2026-05-03T15:00" });
    expect(r.issues.some((i) => i.date === "2026-05-01" && /arrival/.test(i.message))).toBe(true);
    expect(r.issues.some((i) => i.date === "2026-05-02" && /driving/.test(i.message))).toBe(true);
    expect(r.issues.some((i) => i.date === "2026-05-03" && /departure/.test(i.message))).toBe(true);
  });
});

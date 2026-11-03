import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { travelersToday, tripIsLive } from "@/lib/dates";

vi.mock("next/navigation", () => ({ usePathname: () => "/trips/t1/itinerary", useRouter: () => ({ refresh() {} }) }));
vi.mock("@/app/actions/members", () => ({ createInviteAction: async () => ({ ok: true, data: { url: "https://example.test/invite/x", emailStatus: null } }) }));

const { TripNav } = await import("@/components/trip-nav");
const { JourneyCover } = await import("@/components/journey-cover");
const { InviteButton } = await import("@/components/invite");

const chat = { unread: 0, readSeq: 0, revision: 0 };
const desktopLinks = (html: string) => [...html.match(/<nav\b[^>]*class="mb-6[^>]*>([\s\S]*?)<\/nav>/)![1].matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const phoneBar = (html: string) => {
  const bar = html.match(/<nav\b[^>]*class="trip-tabbar[^>]*>([\s\S]*?)<\/nav>/)![1];
  return [...bar.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
};

describe("trip is live", () => {
  const trip = { startDate: "2026-11-10", endDate: "2026-11-14" };
  it("is live from the first to the last day, inclusive", () => {
    expect(tripIsLive(trip, "2026-11-09")).toBe(false);
    expect(tripIsLive(trip, "2026-11-10")).toBe(true);
    expect(tripIsLive(trip, "2026-11-14")).toBe(true);
    expect(tripIsLive(trip, "2026-11-15")).toBe(false);
    expect(tripIsLive({ startDate: null, endDate: null }, "2026-11-10")).toBe(false);
  });
  it("uses the time zone of the destination the travelers are in", () => {
    // 23:30 UTC on 9 Nov is already 10 Nov in Tokyo but still 9 Nov in London.
    const now = new Date("2026-11-09T23:30:00Z");
    const trip = { timezone: "Europe/London", destinations: [{ arriveDate: "2026-11-09", departDate: "2026-11-14", timezone: "Asia/Tokyo" }] };
    expect(travelersToday(trip, now)).toBe("2026-11-10");
    expect(travelersToday({ timezone: "Europe/London", destinations: [] }, now)).toBe("2026-11-09");
  });
});

describe("Today in the trip navigation", () => {
  it("is hidden before and after the trip", () => {
    const html = renderToStaticMarkup(createElement(TripNav, { tripId: "t1", initialChat: chat }));
    expect(html).not.toContain("/trips/t1/today");
  });
  it("comes first while the trip is on, and Expenses and Chat stay in the phone bar", () => {
    const html = renderToStaticMarkup(createElement(TripNav, { tripId: "t1", initialChat: chat, live: true }));
    expect(desktopLinks(html)[0]).toBe("/trips/t1/today");
    expect(phoneBar(html)).toEqual(["/trips/t1/today", "/trips/t1/itinerary", "/trips/t1/expenses", "/trips/t1/chat"]);
  });
});

describe("Invite on the trip banner", () => {
  it("shows the action passed in", () => {
    const action = createElement(InviteButton, { tripId: "t1", tripName: "Lisbon", travelers: [] });
    const html = renderToStaticMarkup(createElement(JourneyCover, { tripId: "t1", name: "Lisbon", dates: "", destinations: [], action }));
    expect(html).toContain("journey-cover-action");
    expect(html).toMatch(/<button[^>]*class="invite-button"[^>]*>[\s\S]*Invite<\/button>/);
  });
  it("shows nothing extra without one", () => {
    const html = renderToStaticMarkup(createElement(JourneyCover, { tripId: "t1", name: "Lisbon", dates: "", destinations: [] }));
    expect(html).not.toContain("journey-cover-action");
  });
});

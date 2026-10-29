import { beforeEach, afterEach, expect, it } from "vitest";
import { GET as publicPage } from "@/app/api/mobile/public/route";
import { POST as privateCommand } from "@/app/api/mobile/workspace/route";
import { PUBLIC_GUIDE_SLUGS, publicHttpsLink, publicLoginDestination, type MobilePublicHome, type MobilePublicGuide } from "@/lib/mobile-public";
import { CITY_GUIDES } from "@/server/examples/city-guides";
import { EXAMPLES } from "@/server/examples/data";
import { mobileCommand } from "@/server/mobile/commands";
import { getMobileTrips } from "@/server/mobile/service";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { prisma } from "@/server/db";
import { makeTrip, makeUser, resetDb } from "./helpers";

const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, planAccessEnabled: true }); });
afterEach(() => setTestRuntime(runtime));
const read = (query = "", cookie?: string) => publicPage(new Request(`https://www.tripanize.app/api/mobile/public${query}`, { headers: cookie ? { Cookie: cookie } : {} }));

it("publishes only the editorial catalog without authentication or personalization", async () => {
  const before = read(); expect(before.status).toBe(200);
  expect(before.headers.get("Cache-Control")).toBe("public, max-age=300");
  const baseline = await before.json();
  const owner = await makeUser("Private traveler"), id = await makeTrip(owner.id);
  await prisma.trip.update({ where: { id }, data: { name: "Private unreleased destination" } });
  const after = await read("", "better-auth.session_token=forged").json() as MobilePublicHome;
  expect(after).toEqual(baseline);
  expect(after.guides.map((g: { slug: string }) => g.slug)).toEqual(CITY_GUIDES.map(g => g.slug));
  expect(JSON.stringify(after)).not.toMatch(/Private traveler|Private unreleased|membership|userId|tripId|email/);
  for (const slug of PUBLIC_GUIDE_SLUGS) {
    const result = read(`?guide=${slug}`); expect(result.status).toBe(200);
    const guide = await result.json() as MobilePublicGuide;
    expect(guide.days).toHaveLength(EXAMPLES.find(e => e.slug === slug)!.days.length);
    expect(guide.days[0].stops[0].title).toBe(EXAMPLES.find(e => e.slug === slug)!.days[0].stops[0].title);
    expect(guide).not.toHaveProperty("userId"); expect(guide).not.toHaveProperty("tripId");
  }
});

it("cannot use the public feed as a private screen or arbitrary file dispatcher", async () => {
  for (const query of ["?screen=admin", "?tripId=private", "?guide=paris&userId=private", "?guide=paris&guide=london"]) {
    const response = read(query); expect(response.status).toBe(400); expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  for (const slug of ["", "admin", "../../account", "__proto__", "constructor"]) expect(read(`?guide=${encodeURIComponent(slug)}`).status).toBe(404);
});

it("allows only known local login destinations and safe public provider links", () => {
  expect(publicLoginDestination("start")).toBe("/start");
  for (const slug of PUBLIC_GUIDE_SLUGS) expect(publicLoginDestination(`guide:${slug}`)).toBe(`/guide/${slug}`);
  for (const next of ["https://attacker.test", "//attacker.test", "/admin", "guide:../../account", "guide:%2fadmin", ["start"], null, undefined]) expect(publicLoginDestination(next)).toBe("/");
  expect(publicHttpsLink("https://www.paris.fr/")).toBe("https://www.paris.fr/");
  for (const url of ["javascript:alert(1)", "file:///private", "http://insecure.test", "https://name:password@example.com", "tripanize://admin", "//example.com", undefined]) expect(publicHttpsLink(url)).toBeNull();
});

it("requires a session to save a public example and preserves the Standard entitlement", async () => {
  const denied = await privateCommand(new Request("https://www.tripanize.app/api/mobile/workspace", { method: "POST", headers: { "Content-Type": "application/json", Origin: "tripanize://" }, body: JSON.stringify({ action: "example.copy", values: { slug: "paris", startDate: "2027-05-01" } }) }));
  expect(denied.status).toBe(401);
  const owner = await makeUser("Example traveler");
  const command = (slug: string, startDate: string) => mobileCommand(owner.id, { action: "example.copy", values: { slug, startDate } });
  await expect(command("private-trip", "2027-05-01")).rejects.toThrow();
  await expect(command("paris", "2027-02-30")).rejects.toMatchObject({ code: "VALIDATION" });
  expect(await prisma.trip.count()).toBe(0);
  const copied = await command("paris", "2027-05-01");
  const tripId = copied.to!.tripId!;
  expect(copied.to!.screen).toBe("itinerary");
  expect((await getMobileTrips(owner.id)).trips).toMatchObject([{ id: tripId, role: "OWNER", premium: false }]);
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  expect(trip.startDate).toBe("2027-05-01"); expect(trip.endDate).toBe("2027-05-04");
  expect(await prisma.itineraryDay.count({ where: { tripId } })).toBe(4);
  const other = await makeUser("Another traveler");
  expect((await getMobileTrips(other.id)).trips).toEqual([]);
});

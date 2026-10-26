import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { findDestinationImage, getTripCover } from "@/server/images";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());
const skyline = { title: "New York City", index: 1, coordinates: [{ lat: 40.71, lon: -74.0 }], pageimage: "Manhattan_skyline.jpg", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/skyline.jpg" } };
function provider(pages: unknown[] = [skyline]) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    return Response.json(url.hostname === "commons.wikimedia.org" ? { query: { pages: { "1": { imageinfo: [{ descriptionurl: "https://commons.wikimedia.org/wiki/File:Manhattan_skyline.jpg", extmetadata: { Artist: { value: '<a href="/author">Test Photographer</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] } } } } : { query: { pages: Object.fromEntries(pages.map((p, i) => [String(i), p])) } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("destination trip covers", () => {
  it("finds New York by country, credits the photographer, and reuses the cached result", async () => {
    const fetch = provider();
    const image = await findDestinationImage("New York", "United States");
    expect(image).toMatchObject({ url: skyline.thumbnail.source, credit: "Test Photographer · CC BY-SA 4.0", pageUrl: expect.stringContaining("commons.wikimedia.org/wiki/File:") });
    const query = new URL(fetch.mock.calls[0][0] as string).searchParams.get("gsrsearch");
    expect(query).toBe('intitle:"New York" "United States"');
    expect(new URL(fetch.mock.calls[0][0] as string).searchParams.get("pithumbsize")).toBe("1920");
    expect(await findDestinationImage("New York", "United States")).toEqual(image);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips flags and non-geographic pages instead of displaying the wrong image", async () => {
    provider([{ ...skyline, title: "New York (state)", index: 0, pageimage: "Flag_of_New_York.svg" }, { ...skyline, index: 0, coordinates: undefined }, skyline]);
    expect((await findDestinationImage("New York"))?.url).toBe(skyline.thumbnail.source);
  });

  it("works for existing trips, refreshes when the destination changes, and leaves trip activity untouched", async () => {
    const fetch = provider();
    const owner = await makeUser("PhotoOwner");
    const tripId = await makeTrip(owner.id, { destinations: [{ name: "New York", country: "United States" }] });
    const before = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect((await getTripCover(owner.id, tripId)).destination).toBe("New York");
    const after = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.revision).toBe(before.revision);
    await prisma.destination.updateMany({ where: { tripId }, data: { name: "Paris", country: "France" } });
    await getTripCover(owner.id, tripId);
    expect(new URL(fetch.mock.calls[2][0] as string).searchParams.get("gsrsearch")).toBe('intitle:"Paris" "France"');
    const outsider = await makeUser("Outsider");
    await expect(getTripCover(outsider.id, tripId)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps a destination fallback when no suitable image exists or the provider fails", async () => {
    const fetch = provider([{ ...skyline, pageimage: "City_logo.png" }]);
    expect(await findDestinationImage("No photo city")).toBeNull();
    fetch.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await findDestinationImage("Offline city")).toBeNull();
  });
});

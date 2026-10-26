import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { ensureTripCover, findDestinationImage, getTripCover } from "@/server/images";
import { appRuntime, currentRuntime } from "@/server/cloudflare/runtime";
import { createTrip, listTrips, updateTrip } from "@/server/trips/service";
import { createTripDraft, chooseNormal, saveOnboardingDetails } from "@/server/trips/onboarding";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.unstubAllGlobals());
const skyline = { title: "New York City", index: 1, coordinates: [{ lat: 40.71, lon: -74.0 }], pageimage: "Manhattan_skyline.jpg", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/skyline.jpg", width: 1920, height: 1080 } };
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
    provider([{ ...skyline, title: "New York (state)", index: 0, pageimage: "Flag_of_New_York.svg" }, { ...skyline, index: 0, coordinates: undefined }, { ...skyline, index: 0, thumbnail: { ...skyline.thumbnail, width: 600 } }, skyline]);
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


  it("automatically saves an HD cover on creation and reuses it without another provider call", async () => {
    const fetch = provider();
    const tasks: (() => Promise<void>)[] = [];
    const owner = await makeUser("AutomaticPhoto");
    const tripId = await appRuntime.run({ ...currentRuntime(), background: task => tasks.push(task) }, () => createTrip(owner.id, { name: "New York holiday", destinations: [{ name: "New York", country: "United States" }] }));
    expect(fetch).not.toHaveBeenCalled(); // The trip response does not wait for an external provider.
    const before = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    const notifications = await prisma.tripNotification.count({ where: { tripId } });
    await tasks[0]();
    const after = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    expect(after.imageUrl).toBe(skyline.thumbnail.source);
    expect(after.imageDestinationKey).toContain('"new york","united states"');
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect(after.version).toBe(before.version);
    expect(after.revision).toBe(before.revision);
    expect(await prisma.tripNotification.count({ where: { tripId } })).toBe(notifications);
    expect((await listTrips(owner.id))[0].coverImage?.url).toBe(skyline.thumbnail.source);
    await prisma.externalCache.deleteMany({});
    expect((await getTripCover(owner.id, tripId)).image?.url).toBe(skyline.thumbnail.source);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("adds the photo when a destination is entered in the main onboarding flow", async () => {
    provider();
    const tasks: (() => Promise<void>)[] = [];
    const owner = await makeUser("OnboardingPhoto");
    await appRuntime.run({ ...currentRuntime(), background: task => tasks.push(task) }, async () => {
      const draft = await createTripDraft(owner.id, "New York holiday");
      expect(tasks).toHaveLength(0);
      await chooseNormal(owner.id, draft.id);
      const trip = await prisma.trip.findUniqueOrThrow({ where: { id: draft.id } });
      await saveOnboardingDetails(owner.id, draft.id, { name: trip.name, startDate: "2027-05-01", endDate: "2027-05-02", destinations: [{ name: "New York", country: "United States" }] }, trip.version);
      expect(tasks).toHaveLength(1);
      await tasks[0]();
      expect((await prisma.trip.findUniqueOrThrow({ where: { id: draft.id } })).imageUrl).toBe(skyline.thumbnail.source);
    });
  });

  it("clears the previous photo when country changes or the destination is removed", async () => {
    provider();
    const owner = await makeUser("ChangedPhoto");
    const id = await makeTrip(owner.id, { destinations: [{ name: "New York", country: "United States" }] });
    await ensureTripCover(id);
    let trip = await prisma.trip.findUniqueOrThrow({ where: { id } });
    await updateTrip(owner.id, id, { name: trip.name, destinations: [{ name: "New York", country: "United Kingdom" }] }, trip.version);
    trip = await prisma.trip.findUniqueOrThrow({ where: { id } });
    expect(trip.imageUrl).toBeNull();
    expect(trip.imageCredit).toBeNull();
    expect(trip.imagePageUrl).toBeNull();
    expect(trip.imageDestinationKey).toBeNull();
    await ensureTripCover(id);
    trip = await prisma.trip.findUniqueOrThrow({ where: { id } });
    await updateTrip(owner.id, id, { name: trip.name, destinations: [] }, trip.version);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id } })).imageUrl).toBeNull();
  });

  it("does not save a late provider result over a newly chosen destination", async () => {
    const fetch = provider();
    let release!: () => void;
    let requested!: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementationOnce(async input => { requested(); await pending; return original(input); });
    const owner = await makeUser("RacePhoto");
    const id = await makeTrip(owner.id, { destinations: [{ name: "New York", country: "United States" }] });
    const resolving = ensureTripCover(id);
    await started;
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id } });
    await updateTrip(owner.id, id, { name: trip.name, destinations: [{ name: "Paris", country: "France" }] }, trip.version);
    release();
    expect(await resolving).toEqual({ destination: "Paris", image: null });
    expect((await prisma.trip.findUniqueOrThrow({ where: { id } })).imageUrl).toBeNull();
  });
  it("keeps a destination fallback when no suitable image exists or the provider fails", async () => {
    const fetch = provider([{ ...skyline, pageimage: "City_logo.png" }]);
    expect(await findDestinationImage("No photo city")).toBeNull();
    fetch.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await findDestinationImage("Offline city")).toBeNull();
  });

});

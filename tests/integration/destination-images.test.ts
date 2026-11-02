import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { destinationImageKey, ensureTripCover, findDestinationImage, getTripCover } from "@/server/images";
import { appRuntime, currentRuntime } from "@/server/cloudflare/runtime";
import { createTrip, listTrips, updateTrip } from "@/server/trips/service";
import { createTripDraft, chooseNormal, saveOnboardingDetails } from "@/server/trips/onboarding";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const skyline = { title: "New York City", index: 1, coordinates: [{ lat: 40.71, lon: -74.0 }], pageimage: "Manhattan_skyline.jpg", thumbnail: { source: "https://upload.wikimedia.org/wikipedia/commons/skyline.jpg", width: 1920, height: 1080 } };
function provider(pages: unknown[] = [skyline]) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    if (url.hostname === "www.wikidata.org") return Response.json({ entities: {
      Q30: { id: "Q30", claims: { P297: [{ mainsnak: { datavalue: { value: "US" } } }] } },
      Q142: { id: "Q142", claims: { P297: [{ mainsnak: { datavalue: { value: "FR" } } }] } },
      Q145: { id: "Q145", claims: { P297: [{ mainsnak: { datavalue: { value: "GB" } } }] } },
      Q60: { id: "Q60", sitelinks: { enwiki: { title: "New York City" } }, claims: { P17: [{ mainsnak: { datavalue: { value: { id: "Q30" } } } }] } },
      Q90: { id: "Q90", sitelinks: { enwiki: { title: "Paris" } }, claims: { P17: [{ mainsnak: { datavalue: { value: { id: "Q142" } } } }] } },
    } });
    const selected = pages.length === 1 && pages[0] === skyline && url.searchParams.get("gsrsearch")?.includes('"Paris"') ? [{ ...skyline, title: "Paris", pageimage: "Paris_skyline.jpg" }] : pages;
    return Response.json(url.hostname === "commons.wikimedia.org" ? { query: { pages: { "1": { imageinfo: [{ descriptionurl: "https://commons.wikimedia.org/wiki/File:Manhattan_skyline.jpg", extmetadata: { Artist: { value: '<a href="/author">Test Photographer</a>' }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] } } } } : { query: { pages: Object.fromEntries(selected.map((p, i) => [String(i), p])) } });
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
    expect(new URL(fetch.mock.calls[0][0] as string).searchParams.get("pithumbsize")).toBe("2400");
    expect(await findDestinationImage("New York", "United States")).toEqual(image);
    expect(fetch).toHaveBeenCalledTimes(3);
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
    expect(new URL(fetch.mock.calls[3][0] as string).searchParams.get("gsrsearch")).toBe('intitle:"Paris" "France"');
    const outsider = await makeUser("Outsider");
    await expect(getTripCover(outsider.id, tripId)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(6);
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
    expect(fetch).toHaveBeenCalledTimes(3);
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
    // Keep this test's host cooldown in the past after restoring the real clock.
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(Date.now() - 10 * 60_000);
    fetch.mockRejectedValueOnce(new Error("Unavailable"));
    expect(await findDestinationImage("Offline city")).toBeNull();
  });

  it("uses the selected HD national landmarks for Lebanon and Bahrain without a broad country search", async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("commons.wikimedia.org");
      const file = url.searchParams.get("titles")!;
      return Response.json({ query: { pages: { "1": { imageinfo: [{ width: 5000, height: 3000, thumbwidth: 2400, thumbheight: 1440,
        thumburl: `https://upload.wikimedia.org/wikipedia/commons/${encodeURIComponent(file)}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(file)}`,
        extmetadata: { Artist: { value: "Photographer" }, LicenseShortName: { value: "CC BY 2.0" } },
      }] } } } });
    });
    vi.stubGlobal("fetch", fetch);
    const lebanon = await findDestinationImage("Lebanon");
    const bahrain = await findDestinationImage("Bahrain", "Bahrain");
    expect(lebanon?.pageUrl).toContain(encodeURIComponent("Beirut-Rouche rock view1.jpg"));
    expect(bahrain?.pageUrl).toContain(encodeURIComponent("Manama Bahrain World Trade Centre & Bahrain Financial Harbour 2.jpg"));
    expect(new URL(String(fetch.mock.calls[0][0])).searchParams.get("iiurlwidth")).toBe("2400");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not use a same-named city in the wrong country", async () => {
    const fetch = provider([{ ...skyline, title: "Cambridge", pageprops: { wikibase_item: "Q60" } }]);
    expect(await findDestinationImage("Cambridge", "United Kingdom")).toBeNull();
    expect(fetch.mock.calls.every(([url]) => new URL(String(url)).hostname !== "commons.wikimedia.org")).toBe(true);
  });

  it("rejects unrelated articles, maps, portraits and low-resolution photos", async () => {
    provider([
      { ...skyline, index: 0, title: "New York Times" },
      { ...skyline, index: 0, pageimage: "New_York_map.png" },
      { ...skyline, index: 0, thumbnail: { ...skyline.thumbnail, width: 2400, height: 4000 } },
      skyline,
    ]);
    expect((await findDestinationImage("New York"))?.url).toBe(skyline.thumbnail.source);
  });

  it("replaces an old saved cover automatically without changing trip activity", async () => {
    const owner = await makeUser("OldCover");
    const id = await makeTrip(owner.id, { destinations: [{ name: "New York", country: "United States" }] });
    await prisma.trip.update({ where: { id }, data: { imageUrl: "https://upload.wikimedia.org/wikipedia/commons/irrelevant.jpg", imageCredit: "Old", imageDestinationKey: 'destination-photo:v4-hd:["new york","united states"]' } });
    const before = await prisma.trip.findUniqueOrThrow({ where: { id } });
    const fetch = provider();
    const tasks: (() => Promise<void>)[] = [];
    const listed = await appRuntime.run({ ...currentRuntime(), background: task => tasks.push(task) }, () => listTrips(owner.id));
    expect(listed[0].coverImage).toBeNull();
    expect(tasks).toHaveLength(1);
    await tasks[0]();
    const after = await prisma.trip.findUniqueOrThrow({ where: { id } });
    expect(after).toMatchObject({ imageUrl: skyline.thumbnail.source, imageDestinationKey: destinationImageKey("New York", "United States"), updatedAt: before.updatedAt, revision: before.revision, version: before.version });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect((await listTrips(owner.id))[0].coverImage?.url).toBe(skyline.thumbnail.source);
  });

  it("uses a verified capital for a country without an editorial landmark, instead of random results", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      // Synthetic entity IDs isolate the protocol test from live Wikidata.
      if (url.hostname === "www.wikidata.org") return Response.json({ entities: url.searchParams.has("titles") ? {
        Q900001: { id: "Q900001", claims: { P297: [{ mainsnak: { datavalue: { value: "BW" } } }], P36: [{ mainsnak: { datavalue: { value: { id: "Q900002" } } } }] } },
      } : { Q900002: { id: "Q900002", sitelinks: { enwiki: { title: "Gaborone" } }, claims: { P17: [{ mainsnak: { datavalue: { value: { id: "Q900001" } } } }] } } } });
      if (url.hostname === "en.wikipedia.org") {
        expect(url.searchParams.get("titles")).toBe("Gaborone");
        expect(url.searchParams.has("gsrsearch")).toBe(false);
        return Response.json({ query: { pages: { "1": { ...skyline, title: "Gaborone", pageimage: "Gaborone_skyline.jpg" } } } });
      }
      return Response.json({ query: { pages: { "1": { imageinfo: [{ width: 2400, height: 1600, url: "https://upload.wikimedia.org/wikipedia/commons/Gaborone_skyline.jpg", extmetadata: { Artist: { value: "Photographer" }, LicenseShortName: { value: "CC BY-SA 4.0" } } }] } } } });
    }));
    expect((await findDestinationImage("Botswana"))?.url).toContain("Gaborone_skyline.jpg");
  });

  it("shares concurrent lookups instead of sending repeated provider requests", async () => {
    const fetch = provider();
    const images = await Promise.all([findDestinationImage("New York", "United States"), findDestinationImage("New York", "United States"), findDestinationImage("New York", "United States")]);
    expect(images.every(image => image?.url === skyline.thumbnail.source)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not publish a photo without a reusable license", async () => {
    const fetch = provider();
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async input => {
      if (new URL(String(input)).hostname !== "commons.wikimedia.org") return original(input);
      return Response.json({ query: { pages: { "1": { imageinfo: [{ url: skyline.thumbnail.source, width: 2400, height: 1600, extmetadata: { LicenseShortName: { value: "CC BY-NC 4.0" } } }] } } } });
    });
    expect(await findDestinationImage("New York", "United States")).toBeNull();
  });

});

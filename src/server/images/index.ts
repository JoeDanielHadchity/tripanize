import { cached, fetchJson } from "@/server/http";
import { safeUrl } from "@/lib/maps";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { countryFor, destinationLandmarks, placeIdentity, type Landmark } from "./landmarks";

export type DestinationImage = { url: string; credit: string; pageUrl: string | null };
type WikiPage = {
  title: string; index?: number; fullurl?: string; pageimage?: string;
  coordinates?: { lat: number; lon: number }[];
  thumbnail?: { source: string; width: number; height: number };
  pageprops?: { wikibase_item?: string; disambiguation?: string };
};
type WikiSearch = { query?: { pages?: Record<string, WikiPage>; redirects?: { from: string; to: string }[] } };
type FileInfo = { url?: string; thumburl?: string; width?: number; height?: number; thumbwidth?: number; thumbheight?: number; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> };
type ImageInfo = { query?: { pages?: Record<string, { imageinfo?: FileInfo[] }> } };
type Entity = { id: string; claims?: Record<string, { rank?: string; mainsnak?: { datavalue?: { value?: unknown } }; qualifiers?: Record<string, unknown> }[]>; sitelinks?: { enwiki?: { title: string } } };
type Entities = { entities?: Record<string, Entity> };

const plain = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const quote = (value: string) => `"${value.replace(/["\\]/g, " ").trim()}"`;

export const destinationImageKey = (name: string, country?: string | null) =>
  `destination-photo:v5-iconic:${JSON.stringify([name.trim().slice(0, 180).toLowerCase(), country?.trim().slice(0, 100).toLowerCase() ?? ""])}`;

type Place = { name: string; country: string | null };
type SavedCover = { imageUrl: string | null; imageCredit: string | null; imagePageUrl: string | null; imageDestinationKey: string | null };

/** Only reuse photos matched to the current destination and the HD lookup policy. */
export function savedTripImage(trip: SavedCover, destination?: Place): DestinationImage | null {
  const url = safeUrl(trip.imageUrl);
  if (!destination || !url || trip.imageDestinationKey !== destinationImageKey(destination.name, destination.country)) return null;
  return { url, credit: trip.imageCredit ?? "Wikimedia Commons", pageUrl: safeUrl(trip.imagePageUrl) };
}

const NOT_A_PHOTO = /\b(flag|logo|coat.of.arms|seal|map|locator|diagram|chart|portrait|signature|collage|montage|drawing|engraving|painting|replica)\b/i;
const photoFile = (name: string) => /\.(jpe?g|png|webp)$/i.test(name) && !NOT_A_PHOTO.test(name.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2"));
const widePhoto = (width: number, height: number) => width >= 1920 && height >= 1080 && width / height >= 1.2 && width / height <= 3;
const photoUrl = (raw?: string) => {
  const url = safeUrl(raw);
  return url && new URL(url).protocol === "https:" && ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(new URL(url).hostname) ? url : null;
};

async function fromFile(name: string, fallback?: WikiPage["thumbnail"]): Promise<DestinationImage | null> {
  if (!photoFile(name)) return null;
  const query = new URLSearchParams({ action: "query", format: "json", titles: `File:${name}`, prop: "imageinfo", iiprop: "url|size|extmetadata", iiurlwidth: "2400", iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl|ImageDescription" });
  const data = await fetchJson<ImageInfo>("Wikimedia Commons", `https://commons.wikimedia.org/w/api.php?${query}`, { timeoutMs: 6000 });
  const file = Object.values(data.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!file) return null; // An enwiki-only/fair-use file is not a reusable Commons photo.
  const width = file.thumbwidth ?? file.width ?? fallback?.width ?? 0;
  const height = file.thumbheight ?? file.height ?? fallback?.height ?? 0;
  if (!widePhoto(width, height)) return null;
  const license = plain(file.extmetadata?.LicenseShortName?.value ?? "");
  if (!/^(CC BY(?:-SA)?(?:\s|$)|CC0(?:\s|$)|Public domain$|PDM(?:\s|$))/i.test(license)) return null;
  const url = photoUrl(file.thumburl) ?? photoUrl(file.url) ?? photoUrl(fallback?.source);
  if (!url) return null;
  const artist = plain(file.extmetadata?.Artist?.value ?? "");
  return { url, credit: [artist || "Wikimedia Commons", license].join(" · "), pageUrl: safeUrl(file.descriptionurl) ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}` };
}

async function wikiTitles(titles: string[]) {
  const query = new URLSearchParams({ action: "query", format: "json", titles: titles.join("|"), redirects: "1", prop: "pageimages|coordinates|pageprops", ppprop: "wikibase_item|disambiguation", piprop: "thumbnail|name", pithumbsize: "2400" });
  return fetchJson<WikiSearch>("Wikipedia", `https://en.wikipedia.org/w/api.php?${query}`, { timeoutMs: 6000 });
}

async function iconicPhoto(landmarks: Landmark[]) {
  for (const landmark of landmarks) if (landmark.file) {
    const image = await fromFile(landmark.file);
    if (image) return image;
  }
  if (!landmarks.length) return null;
  const data = await wikiTitles(landmarks.map(l => l.title));
  const pages = Object.values(data.query?.pages ?? {});
  for (const landmark of landmarks) {
    const redirected = data.query?.redirects?.find(r => placeIdentity(r.from) === placeIdentity(landmark.title))?.to;
    const wanted = new Set([placeIdentity(landmark.title), ...(redirected ? [placeIdentity(redirected)] : [])]);
    const page = pages.find(p => wanted.has(placeIdentity(p.title)) && validPagePhoto(p));
    if (page) { const image = await fromFile(page.pageimage!, page.thumbnail); if (image) return image; }
  }
  return null;
}

function validPagePhoto(page: WikiPage) {
  return Boolean(page.coordinates?.length && page.pageprops?.disambiguation === undefined && page.pageimage && photoFile(page.pageimage) && page.thumbnail && widePhoto(page.thumbnail.width, page.thumbnail.height) && photoUrl(page.thumbnail.source));
}

const values = (entity: Entity, property: string) => (entity.claims?.[property] ?? []).filter(c => c.rank !== "deprecated" && !c.qualifiers?.P582).map(c => c.mainsnak?.datavalue?.value);
const ids = (entity: Entity, property: string) => values(entity, property).flatMap(v => v && typeof v === "object" && "id" in v && typeof v.id === "string" ? [v.id] : []);
async function entities(query: Record<string, string>) {
  const params = new URLSearchParams({ action: "wbgetentities", format: "json", props: "claims|sitelinks", sitefilter: "enwiki", ...query });
  return (await fetchJson<Entities>("Wikidata", `https://www.wikidata.org/w/api.php?${params}`, { timeoutMs: 6000 })).entities ?? {};
}

/** Validate geography rather than trusting a popular search result with a similar name. */
async function inCountry(pages: WikiPage[], region: NonNullable<ReturnType<typeof countryFor>>) {
  if (!pages.length) return [];
  const records = Object.values(await entities({ sites: "enwiki", titles: [...new Set([region.title, ...pages.map(p => p.title)])].join("|") }));
  const country = records.find(e => values(e, "P297").includes(region.code));
  if (!country) return [];
  return pages.filter(p => {
    const record = records.find(e => e.id === p.pageprops?.wikibase_item || e.sitelinks?.enwiki?.title === p.title);
    return record && (record.id === country.id || ids(record, "P17").includes(country.id));
  });
}

/** Countries without an editorial landmark use their verified current capital, never an unrelated search hit. */
async function capitalPhoto(country: NonNullable<ReturnType<typeof countryFor>>) {
  const records = Object.values(await entities({ sites: "enwiki", titles: country.title }));
  const record = records.find(e => values(e, "P297").includes(country.code));
  if (!record) return null;
  const capitals = ids(record, "P36").slice(0, 3);
  if (!capitals.length) return null;
  const locations = Object.values(await entities({ ids: capitals.join("|") }));
  const titles = locations.filter(e => ids(e, "P17").includes(record.id)).flatMap(e => e.sitelinks?.enwiki?.title ? [e.sitelinks.enwiki.title] : []);
  return iconicPhoto(titles.map(title => ({ title })));
}

const activeLookups = new Map<string, Promise<DestinationImage | null>>();
/** Coalesce concurrent card loads instead of repeating the same external lookup. */
export async function findDestinationImage(place: string, country?: string | null): Promise<DestinationImage | null> {
  const key = destinationImageKey(place, country);
  const pending = activeLookups.get(key);
  if (pending) return pending;
  const request = lookupDestinationImage(place, country);
  activeLookups.set(key, request);
  try { return await request; } finally { if (activeLookups.get(key) === request) activeLookups.delete(key); }
}

/** Landmark-first for countries; exact geographic identity for cities. No paid AI or stock-photo key. */
async function lookupDestinationImage(place: string, country?: string | null): Promise<DestinationImage | null> {
  const name = place.trim().slice(0, 180);
  const region = country?.trim().slice(0, 100) ?? "";
  if (!name) return null;
  try {
    const { value } = await cached(destinationImageKey(name, region), 86400, async () => {
      const plan = destinationLandmarks(name, region);
      if (plan.country) return { image: await iconicPhoto(plan.landmarks) ?? await capitalPhoto(plan.country) };
      const area = [name.split(",").slice(1).join(","), region].filter(Boolean).join(" ");
      const query = new URLSearchParams({
        action: "query", format: "json", generator: "search",
        gsrsearch: `intitle:${quote(name.split(",")[0])}${area ? ` ${quote(area)}` : ""}`,
        gsrlimit: "5", prop: "pageimages|coordinates|info|pageprops", ppprop: "wikibase_item|disambiguation", piprop: "thumbnail|name", pithumbsize: "2400", inprop: "url",
      });
      const data = await fetchJson<WikiSearch>("Wikipedia", `https://en.wikipedia.org/w/api.php?${query}`, { timeoutMs: 6000 });
      const identity = placeIdentity(name.split(",")[0]);
      let pages = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99)).filter(p => {
        const title = placeIdentity(p.title.replace(/\s*\([^)]*\)$/, ""));
        return validPagePhoto(p) && (title === identity || title === identity + "city" || title === "cityof" + identity || p.title.toLowerCase().startsWith(name.split(",")[0].toLowerCase() + ","));
      });
      if (plan.requestedCountry) pages = await inCountry(pages, plan.requestedCountry);
      for (const page of pages) {
        const image = await fromFile(page.pageimage!, page.thumbnail);
        if (image) return { image };
      }
      return { image: await iconicPhoto(plan.landmarks) };
    });
    return value.image;
  } catch {
    // Keep the destination label when the photo provider is unavailable; retry on a later visit.
    return null;
  }
}

/** Save once, including attribution. A late response cannot overwrite a new destination. */
export async function ensureTripCover(tripId: string) {
  const trip = await prisma.trip.findUnique({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" }, take: 1 } } });
  const destination = trip?.destinations[0];
  if (!trip || !destination) return { destination: null, image: null };
  const saved = savedTripImage(trip, destination);
  if (saved) return { destination: destination.name, image: saved };
  const image = await findDestinationImage(destination.name, destination.country);
  if (!image) return { destination: destination.name, image: null };
  const key = destinationImageKey(destination.name, destination.country);
  return prisma.$transaction(async tx => {
    const current = await tx.trip.findUnique({ where: { id: tripId }, include: { destinations: { orderBy: { position: "asc" }, take: 1 } } });
    const first = current?.destinations[0];
    if (!current || !first) return { destination: null, image: null };
    if (destinationImageKey(first.name, first.country) !== key) return { destination: first.name, image: savedTripImage(current, first) };
    // Photo enrichment must not change ordering, optimistic versions, activity or notifications.
    await tx.trip.update({ where: { id: tripId }, data: { imageUrl: image.url, imageCredit: image.credit, imagePageUrl: image.pageUrl, imageDestinationKey: key, updatedAt: current.updatedAt } });
    return { destination: first.name, image };
  });
}

/** Cloudflare keeps this work alive after the response, without slowing trip setup. */
export function scheduleTripCover(tripId: string) {
  currentRuntime().background?.(async () => { await ensureTripCover(tripId).catch(() => undefined); });
}

/** Existing trips are backfilled automatically when first viewed. */
export async function getTripCover(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "view");
  return ensureTripCover(tripId);
}

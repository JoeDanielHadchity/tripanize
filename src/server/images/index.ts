import { cached, fetchJson } from "@/server/http";
import { safeUrl } from "@/lib/maps";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";
import { currentRuntime } from "@/server/cloudflare/runtime";

export type DestinationImage = { url: string; credit: string; pageUrl: string | null };
type WikiPage = {
  title: string; index?: number; fullurl?: string; pageimage?: string;
  coordinates?: { lat: number; lon: number }[];
  thumbnail?: { source: string; width: number; height: number };
};
type WikiSearch = { query?: { pages?: Record<string, WikiPage> } };
type ImageInfo = { query?: { pages?: Record<string, { imageinfo?: { descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }> } };

const plain = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const quote = (value: string) => `"${value.replace(/["\\]/g, " ").trim()}"`;

export const destinationImageKey = (name: string, country?: string | null) =>
  `destination-photo:v4-hd:${JSON.stringify([name.trim().slice(0, 180).toLowerCase(), country?.trim().slice(0, 100).toLowerCase() ?? ""])}`;

type Place = { name: string; country: string | null };
type SavedCover = { imageUrl: string | null; imageCredit: string | null; imagePageUrl: string | null; imageDestinationKey: string | null };

/** Only reuse photos matched to the current destination and the HD lookup policy. */
export function savedTripImage(trip: SavedCover, destination?: Place): DestinationImage | null {
  const url = safeUrl(trip.imageUrl);
  if (!destination || !url || trip.imageDestinationKey !== destinationImageKey(destination.name, destination.country)) return null;
  return { url, credit: trip.imageCredit ?? "Wikimedia Commons", pageUrl: safeUrl(trip.imagePageUrl) };
}

/** Place photos only: search by destination AND country; reject flags, logos and non-geographic pages. */
export async function findDestinationImage(place: string, country?: string | null): Promise<DestinationImage | null> {
  const name = place.trim().slice(0, 180);
  const region = country?.trim().slice(0, 100) ?? "";
  if (!name) return null;
  try {
    const { value } = await cached(destinationImageKey(name, region), 86400, async () => {
      const area = [name.split(",").slice(1).join(","), region].filter(Boolean).join(" ");
      const query = new URLSearchParams({
        action: "query", format: "json", generator: "search",
        gsrsearch: `intitle:${quote(name.split(",")[0])}${area ? ` ${quote(area)}` : ""}`,
        gsrlimit: "5", prop: "pageimages|coordinates|info", piprop: "thumbnail|name", pithumbsize: "1920", inprop: "url",
      });
      const data = await fetchJson<WikiSearch>("Wikipedia", `https://en.wikipedia.org/w/api.php?${query}`, { timeoutMs: 6000 });
      const page = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99)).find(p =>
        p.coordinates?.length && p.pageimage && (p.thumbnail?.width ?? 0) >= 1600 && /\.(jpe?g|png|webp)$/i.test(p.pageimage) &&
        !/\b(flag|logo|coat.of.arms|seal|locator|location.map)\b/i.test(p.pageimage.replaceAll("_", " ")) && safeUrl(p.thumbnail?.source),
      );
      if (!page) return { image: null };
      const url = safeUrl(page.thumbnail?.source)!;
      // The file page supplies the original creator and license, rather than attributing the photograph to Wikipedia.
      const fileQuery = new URLSearchParams({ action: "query", format: "json", titles: `File:${page.pageimage}`, prop: "imageinfo", iiprop: "url|extmetadata" });
      const files = await fetchJson<ImageInfo>("Wikimedia Commons", `https://commons.wikimedia.org/w/api.php?${fileQuery}`, { timeoutMs: 6000 });
      const file = Object.values(files.query?.pages ?? {})[0]?.imageinfo?.[0];
      const artist = plain(file?.extmetadata?.Artist?.value ?? "");
      const license = plain(file?.extmetadata?.LicenseShortName?.value ?? "");
      const pageUrl = safeUrl(file?.descriptionurl) ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.pageimage!)}`;
      return { image: { url, credit: [artist || "Wikimedia Commons", license].filter(Boolean).join(" · "), pageUrl } };
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

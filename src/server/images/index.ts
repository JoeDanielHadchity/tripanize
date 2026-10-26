import { cached, fetchJson } from "@/server/http";
import { safeUrl } from "@/lib/maps";
import { prisma } from "@/server/db";
import { requireTrip } from "@/server/auth/permissions";

export type DestinationImage = { url: string; credit: string; pageUrl: string | null };
type WikiPage = {
  title: string; index?: number; fullurl?: string; pageimage?: string;
  coordinates?: { lat: number; lon: number }[];
  thumbnail?: { source: string };
};
type WikiSearch = { query?: { pages?: Record<string, WikiPage> } };
type ImageInfo = { query?: { pages?: Record<string, { imageinfo?: { descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }> } };

const plain = (value: string) => value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const quote = (value: string) => `"${value.replace(/["\\]/g, " ").trim()}"`;

/** Place photos only: search by destination AND country; reject flags, logos and non-geographic pages. */
export async function findDestinationImage(place: string, country?: string | null): Promise<DestinationImage | null> {
  const name = place.trim().slice(0, 180);
  const region = country?.trim().slice(0, 100) ?? "";
  if (!name) return null;
  try {
    const { value } = await cached(`destination-photo:v3-hd:${JSON.stringify([name.toLowerCase(), region.toLowerCase()])}`, 86400, async () => {
      const area = [name.split(",").slice(1).join(","), region].filter(Boolean).join(" ");
      const query = new URLSearchParams({
        action: "query", format: "json", generator: "search",
        gsrsearch: `intitle:${quote(name.split(",")[0])}${area ? ` ${quote(area)}` : ""}`,
        gsrlimit: "5", prop: "pageimages|coordinates|info", piprop: "thumbnail|name", pithumbsize: "1920", inprop: "url",
      });
      const data = await fetchJson<WikiSearch>("Wikipedia", `https://en.wikipedia.org/w/api.php?${query}`, { timeoutMs: 6000 });
      const page = Object.values(data.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99)).find(p =>
        p.coordinates?.length && p.pageimage && /\.(jpe?g|png|webp)$/i.test(p.pageimage) &&
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

/** Resolve on demand for existing and new trips without changing trip revisions or notifying members. */
export async function getTripCover(userId: string, tripId: string) {
  await requireTrip(tripId, userId, "view");
  const destination = await prisma.destination.findFirst({ where: { tripId }, orderBy: { position: "asc" }, select: { name: true, country: true } });
  return { destination: destination?.name ?? null, image: destination ? await findDestinationImage(destination.name, destination.country) : null };
}

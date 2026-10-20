import { cached, fetchJson } from "@/server/http";
import { safeUrl } from "@/lib/maps";

// Destination imagery from Wikipedia page summaries (freely licensed, attributed to the article).
export type DestinationImage = { url: string; credit: string; pageUrl: string | null };

type WikiSummary = { originalimage?: { source: string }; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } }; title?: string };

export async function findDestinationImage(place: string): Promise<DestinationImage | null> {
  const title = place.split(",")[0].trim();
  if (!title) return null;
  try {
    const { value } = await cached(`img:${title.toLowerCase()}`, 60 * 60 * 24 * 30, async () => {
      const data = await fetchJson<WikiSummary>("Wikipedia", `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
      const src = safeUrl(data.thumbnail?.source?.replace(/\/\d+px-/, "/1200px-") ?? data.originalimage?.source);
      if (!src) return null;
      return { url: src, credit: `Image: Wikipedia — ${data.title ?? title}`, pageUrl: safeUrl(data.content_urls?.desktop?.page) };
    });
    return value;
  } catch {
    return null;
  }
}

import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, SITE_ORIGIN } from "@/lib/seo";
import { EXAMPLES } from "@/server/examples/data";

export default function sitemap(): MetadataRoute.Sitemap {
  // Only explicitly public editorial/product pages. Never query users or trips.
  // Omit lastModified until there is a reliable per-page content update date.
  return [...Object.keys(PUBLIC_PAGES), ...EXAMPLES.map(example => `/examples/${example.slug}`)]
    .map(path => ({ url: SITE_ORIGIN + path }));
}

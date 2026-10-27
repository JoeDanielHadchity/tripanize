import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  // Allow HTML crawling so search engines can see the noindex tags on account
  // and invitation pages. Authentication, not robots.txt, protects trip data.
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${SITE_ORIGIN}/sitemap.xml` };
}

import type { Metadata } from "next";
import { publicMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { EXAMPLES } from "@/server/examples/data";
import { CITY_GUIDES, GUIDE_PHOTOS, guideImage } from "@/server/examples/city-guides";
import { CityGuidePage } from "@/components/guides/city-guide-page";
import { ExampleTripPage } from "@/components/guides/example-trip-page";
import { SITE_ORIGIN } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = CITY_GUIDES.find(city => city.slug === slug);
  if (guide) {
    const meta = publicMetadata(`/examples/${slug}`, { title: `${guide.city} 4-Day Itinerary — Sights, Food & Budget`, description: `Explore ${guide.city} in 4 days with a suggested route, estimated budget, transport tips and official booking links. Save an editable copy with Tripanize.` });
    const photo = GUIDE_PHOTOS[slug];
    const image = { url: SITE_ORIGIN + guideImage(slug), width: photo.width, height: photo.height, alt: photo.description };
    return { ...meta, openGraph: { ...meta.openGraph, images: [image] }, twitter: { ...meta.twitter, card: "summary_large_image", images: [image.url] } };
  }
  const ex = EXAMPLES.find((e) => e.slug === slug);
  return ex ? publicMetadata(`/examples/${ex.slug}`, { title: `${ex.nights + 1}-Day ${ex.name} — Example Itinerary`, description: `${ex.summary} Explore this public sample itinerary, then save a copy to plan your own trip with Tripanize.` }) : { title: "Example not found", robots: { index: false, follow: false } };
}

export default async function ExamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ex = EXAMPLES.find((e) => e.slug === slug);
  if (!ex) notFound();
  const user = await getSessionUser();
  const guide = CITY_GUIDES.find(city => city.slug === slug);
  if (guide) return <CityGuidePage guide={guide} user={user} />;
  return <ExampleTripPage example={ex} user={user} />;
}

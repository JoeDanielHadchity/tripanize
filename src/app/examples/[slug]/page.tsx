import type { Metadata } from "next";
import { publicMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { findExample } from "@/server/examples/data";
import { findPublishedIdea, publishedTripIdeas } from "@/server/examples/trip-ideas";
import { CityGuidePage } from "@/components/guides/city-guide-page";
import { ExampleTripPage } from "@/components/guides/example-trip-page";
import { SITE_ORIGIN } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const idea = await findPublishedIdea(slug);
  if (idea) {
    const { guide, photo } = idea, days = guide.days.length;
    const meta = publicMetadata(`/examples/${slug}`, { title: `${guide.city} ${days}-Day Itinerary — Sights, Food & Budget`, description: `Explore ${guide.city} in ${days} days with a suggested route, estimated budget, transport tips and official booking links. Save an editable copy with Tripanize.` });
    const image = { url: SITE_ORIGIN + photo.hero, width: photo.width, height: photo.height, alt: photo.description };
    return { ...meta, openGraph: { ...meta.openGraph, images: [image] }, twitter: { ...meta.twitter, card: "summary_large_image", images: [image.url] } };
  }
  const ex = await findExample(slug);
  return ex ? publicMetadata(`/examples/${ex.slug}`, { title: `${ex.nights + 1}-Day ${ex.name} — Example Itinerary`, description: `${ex.summary} Explore this public sample itinerary, then save a copy to plan your own trip with Tripanize.` }) : { title: "Example not found", robots: { index: false, follow: false } };
}

export default async function ExamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [ex, ideas, user] = await Promise.all([findExample(slug), publishedTripIdeas(), getSessionUser()]);
  if (!ex) notFound();
  const idea = ideas.find(i => i.slug === slug);
  if (idea) return <CityGuidePage idea={idea} ideas={ideas} user={user} />;
  return <ExampleTripPage example={ex} guides={ideas.map(i => i.guide)} user={user} />;
}

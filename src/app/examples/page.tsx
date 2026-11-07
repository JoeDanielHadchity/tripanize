import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { PublicHeader } from "@/components/public-header";
import { GUIDE_PHOTOS, guideCardPreview } from "@/server/examples/city-guides";
import { publishedTripIdeas } from "@/server/examples/trip-ideas";
import { publicMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = publicMetadata("/examples", PUBLIC_PAGES["/examples"]);

export const dynamic = "force-dynamic";

export default async function TripIdeasPage() {
  const [user, ideas] = await Promise.all([getSessionUser(), publishedTripIdeas()]);
  const IDEAS = [
    ...ideas.map(i => ({ slug: i.slug, city: i.guide.city, eyebrow: `${i.guide.country} · ${i.guide.days.length} days`, subtitle: i.guide.subtitle, image: i.photo.preview, alt: i.photo.description })),
    { slug: "lisbon-porto", city: "Lisbon & Porto", eyebrow: "Portugal · 6 days", subtitle: "Two cities, linked by train.", image: guideCardPreview("lisbon-porto"), alt: GUIDE_PHOTOS["lisbon-porto-card"].description },
  ];
  return <><PublicHeader currentPath="/examples" user={user} /><main id="main" className="guide-content"><section className="guide-index-heading"><p className="guide-eyebrow">Trip ideas</p><h1>Start with a city.<br /><em>Make the trip yours.</em></h1><p>Explore a public itinerary, then save an editable copy.</p></section><div className="guide-index-list">{IDEAS.map(idea => <Link key={idea.slug} href={`/examples/${idea.slug}`}><img src={idea.image} alt={idea.alt} width={800} height={600} loading="lazy" decoding="async" /><div><p className="guide-eyebrow">{idea.eyebrow}</p><h2>{idea.city} <span aria-hidden="true">↗</span></h2><p>{idea.subtitle}</p></div></Link>)}</div></main></>;
}

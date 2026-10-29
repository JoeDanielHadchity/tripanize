import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { PublicHeader } from "@/components/public-header";
import { CITY_GUIDES } from "@/server/examples/city-guides";
import { publicMetadata, PUBLIC_PAGES } from "@/lib/seo";

export const metadata = publicMetadata("/examples", PUBLIC_PAGES["/examples"]);

export default async function TripIdeasPage() {
  const user = await getSessionUser();
  return <><PublicHeader currentPath="/examples" user={user} /><main id="main" className="guide-content"><section className="guide-index-heading"><p className="guide-eyebrow">Trip ideas</p><h1>Start with a city.<br /><em>Make the trip yours.</em></h1><p>Explore a public itinerary, then save an editable copy.</p></section><div className="guide-index-list">{CITY_GUIDES.map(guide => <Link key={guide.slug} href={`/examples/${guide.slug}`}><p className="guide-eyebrow">{guide.country} · 4 days</p><h2>{guide.city} <span aria-hidden="true">↗</span></h2><p>{guide.subtitle}</p></Link>)}<Link href="/examples/lisbon-porto"><p className="guide-eyebrow">Portugal · 6 days</p><h2>Lisbon & Porto <span aria-hidden="true">↗</span></h2><p>Two cities, linked by train.</p></Link></div></main></>;
}

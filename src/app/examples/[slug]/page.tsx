import type { Metadata } from "next";
import { publicMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { EXAMPLES } from "@/server/examples/data";
import { PublicHeader } from "@/components/public-header";
import { Badge, LinkButton, Notice } from "@/components/ui";
import { formatDuration } from "@/lib/dates";
import { CopyExample } from "./copy";
import { CITY_GUIDES, GUIDE_PHOTOS, guideImage } from "@/server/examples/city-guides";
import { CityGuidePage } from "@/components/guides/city-guide-page";
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
  return (
    <div className="min-h-dvh">
      <PublicHeader currentPath={`/examples/${slug}`} user={user} />
      <main id="main" className="mx-auto max-w-4xl px-4 pb-16">
        <div className="relative overflow-hidden rounded-3xl p-6 text-white sm:p-10" style={{ background: ex.slug === "lisbon-porto" ? "linear-gradient(90deg,#102c36ed,#102c3699),url(/editorial/guide.webp) center / cover" : ex.image }}>
          <Badge tone="warn" className="mb-3">Example trip — not one of your trips</Badge>
          <h1 className="photo-title font-display text-3xl font-semibold sm:text-4xl">{ex.name}</h1>
          <p className="mt-2 max-w-xl text-white/90">{ex.summary}</p>
          <p className="mt-2 text-sm text-white/85">{ex.nights + 1} days · {ex.destinations.map((d) => d.name).join(" → ")} · budget ≈ €{ex.budget}</p>
        </div>
        <Notice tone="warn" className="mt-5" title="This is a read-only example">
          Written by the Tripanize team to show what a plan looks like — opening hours and prices are illustrative and unverified. Nothing here is saved or editable. Save a copy to get your own editable trip; the copy contains exactly this content shifted to your dates.
        </Notice>
        <div className="mt-5">{user ? <CopyExample slug={ex.slug} /> : <LinkButton href={`/sign-up?next=${encodeURIComponent(`/examples/${ex.slug}`)}`} variant="primary">Create an account to save a copy</LinkButton>}</div>
        <ol className="mt-8 space-y-5">
          {ex.days.map((d) => (
            <li key={d.offset} className="rounded-3xl border border-line bg-surface p-4 sm:p-5">
              <p className="text-sm font-medium text-accent-ink">Day {d.offset + 1} · {ex.destinations[d.destination].name}{d.isTravelDay ? " · Travel day" : ""}</p>
              <h2 className="font-display text-xl font-semibold">{d.title}</h2>
              {d.notes && <p className="mt-1 text-sm text-muted">{d.notes}</p>}
              <ul className="mt-3 space-y-2">
                {d.stops.filter((s) => !s.plan).map((s, i) => (
                  <li key={i} className="flex gap-3 rounded-xl border border-line p-3 text-sm">
                    <span className="w-12 shrink-0 font-mono font-semibold">{s.startTime}</span>
                    <span><span className="font-medium">{s.title}</span> <span className="text-muted">· {formatDuration(s.durationMin)}</span><span className="block text-muted">{s.reason}</span></span>
                  </li>
                ))}
              </ul>
              {d.stops.some((s) => s.plan === "B") && <p className="mt-2 text-sm text-sage-ink">Plan B: {d.stops.filter((s) => s.plan === "B").map((s) => s.title).join(", ")}</p>}
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}

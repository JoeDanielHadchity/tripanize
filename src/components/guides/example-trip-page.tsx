import Link from "next/link";
import type { SessionUser } from "@/server/auth/session";
import { PublicHeader } from "@/components/public-header";
import { LinkButton } from "@/components/ui";
import { CopyExample } from "@/app/examples/[slug]/copy";
import { CITY_GUIDES, GUIDE_PHOTOS, guideImage, type GuideDay } from "@/server/examples/city-guides";
import type { Example } from "@/server/examples/data";
import { formatDuration } from "@/lib/dates";
import { GuideDays } from "./guide-days";

const KIND: Record<string, string> = { sight: "Sight", cafe: "Café", food: "Food", rest: "Free time", museum: "Museum", event: "Evening", transport: "Train", activity: "Activity" };

/** A multi-city example (Lisbon & Porto) in the same layout as the city guides. */
export function ExampleTripPage({ example, user }: { example: Example; user: SessionUser | null }) {
  const authenticated = Boolean(user);
  const signIn = `/sign-in?next=${encodeURIComponent(`/examples/${example.slug}#use-itinerary`)}`;
  const use = authenticated ? "#use-itinerary" : signIn;
  const photo = GUIDE_PHOTOS[example.slug];
  const places = example.destinations.map(d => d.name);
  const days: GuideDay[] = example.days.map(day => {
    const planB = day.stops.filter(s => s.plan === "B");
    return {
      title: day.title,
      area: day.area,
      pace: `${example.destinations[day.destination].name}${day.isTravelDay ? " · travel day" : ""}`,
      note: day.notes ?? "",
      food: "",
      planB: planB.map(s => `${s.title}: ${s.reason}`).join(" "),
      stops: day.stops.filter(s => !s.plan).map(s => ({ time: s.startTime, title: s.title, detail: s.reason, duration: s.durationMin ? formatDuration(s.durationMin) : "", kind: KIND[s.category] ?? "Stop", url: s.officialUrl })),
    };
  });
  return <div className="city-guide-page">
    <PublicHeader currentPath={`/examples/${example.slug}`} user={user} signInHref={signIn} />
    <main id="main" className="guide-content">
      <nav className="guide-city-nav" aria-label="Destination guides">{CITY_GUIDES.map(city => <Link key={city.slug} href={`/examples/${city.slug}`}>{city.city}</Link>)}<Link href={`/examples/${example.slug}`} aria-current="page">Lisbon & Porto</Link></nav>
      <section className="guide-hero" aria-labelledby="guide-title">
        <div>
          <p className="guide-eyebrow">{example.destinations[0].country} · {example.nights + 1} days · {places.join(" → ")}</p>
          <h1 id="guide-title">{example.name}</h1>
          <p className="guide-subtitle">Two cities, linked by train.</p>
          <p className="guide-intro">{example.summary}</p>
          <LinkButton href={use} variant="primary" className="mt-5">Use this itinerary <span aria-hidden="true">→</span></LinkButton>
          <p className="guide-small-note">An editable starting point for your own trip.</p>
        </div>
        <figure className="guide-photo">
          <img src={`/editorial/city-guides/${example.slug}-small.webp`} srcSet={`/editorial/city-guides/${example.slug}-small.webp 1200w, ${guideImage(example.slug)} 2400w`} sizes="(max-width: 700px) calc(100vw - 34px), (max-width: 1120px) calc(50vw - 45px), 515px" alt={photo.description} width={photo.width} height={photo.height} fetchPriority="high" decoding="async" />
          <figcaption>Lisbon · Tram 28</figcaption>
        </figure>
      </section>
      <GuideDays days={days} heading={`Your ${example.nights + 1}-day route.`}>
        <aside className="guide-sidebar">
          {example.budget && <section className="guide-budget" aria-labelledby="guide-budget-title">
            <h2 className="guide-eyebrow" id="guide-budget-title">Planning budget</h2>
            <p className="guide-budget-total">≈ €{example.budget.toLocaleString("en")}</p>
            <p className="guide-budget-basis">Whole trip · {example.nights + 1} days · {example.nights} nights</p>
            <p className="guide-small-note">Illustrative estimate for the group, not live prices. Set your own budget after saving a copy.</p>
          </section>}
          <section className="guide-bookings"><h2>Before you book.</h2><p>What to reserve, and when · reservations are separate</p><ul>{example.bookings.map(booking => <li key={booking.title}>{booking.url ? <a href={booking.url} target="_blank" rel="noopener noreferrer">{booking.title} <span aria-hidden="true">↗</span></a> : <strong>{booking.title}</strong>}<p>{booking.whenToBook}</p></li>)}</ul></section>
        </aside>
      </GuideDays>
      <section className="guide-copy" id="use-itinerary" aria-labelledby="guide-copy-title"><div><h2 id="guide-copy-title">Same starting point. Your own trip.</h2><p>{authenticated ? "Choose a start date to save an editable copy. Everything shifts to your dates." : "Sign in, choose your dates and save an editable copy to My trips."}</p></div>{authenticated ? <CopyExample slug={example.slug} /> : <LinkButton href={signIn} variant="primary">Use this itinerary <span aria-hidden="true">→</span></LinkButton>}</section>
      <section className="guide-faq" aria-label="About this itinerary">
        <details><summary>Is this a real booking?</summary><p>No. It is a sample plan written by the Tripanize team. Opening hours and prices are illustrative, so check them before you go and reserve separately.</p></details>
        <details><summary>Can I change it?</summary><p>Yes. Save a copy and edit every day, add stops or swap cities. <Link href="/plans">Compare plans</Link>.</p></details>
        <details><summary>Photo credit</summary><p>Photograph: <a href={photo.pageUrl} target="_blank" rel="noopener noreferrer">Mehmet Bozgedik on Unsplash</a> ({photo.license}).</p></details>
      </section>
      <nav className="guide-related" aria-label="More city itineraries">{CITY_GUIDES.map(city => <Link key={city.slug} href={`/examples/${city.slug}`}>{city.city} in 4 days <span aria-hidden="true">↗</span></Link>)}</nav>
    </main>
  </div>;
}

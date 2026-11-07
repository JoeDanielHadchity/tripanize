import Link from "next/link";
import { GUIDE_PHOTOS, guideCardImage, guideCardPreview } from "@/server/examples/city-guides";
import { publishedTripIdeas } from "@/server/examples/trip-ideas";

/** Home page grid: the published trip ideas (managed on the Company page) plus Lisbon & Porto. */
export async function TripIdeas() {
  const ideas = (await publishedTripIdeas()).map(i => ({ slug: i.slug, country: i.guide.country, city: i.guide.city, days: i.guide.days.length, preview: i.photo.preview, full: i.photo.card, alt: i.photo.description }));
  const lisbon = GUIDE_PHOTOS["lisbon-porto-card"];
  const all = [...ideas, { slug: "lisbon-porto", country: "Portugal", city: "Lisbon & Porto", days: 6, preview: guideCardPreview("lisbon-porto"), full: guideCardImage("lisbon-porto"), alt: lisbon.description }];
  return <section className="trip-ideas" id="trip-ideas" aria-labelledby="trip-ideas-title">
    <div className="guide-section-heading"><h2 id="trip-ideas-title">Explore trip ideas.</h2><p>Ready-made itineraries to make your own</p></div>
    <div className="trip-idea-grid six">{all.map(guide => <Link className="trip-idea" href={`/examples/${guide.slug}`} key={guide.slug}>
      <img
        src={guide.preview}
        srcSet={guide.preview !== guide.full ? `${guide.preview} 800w, ${guide.full} 2000w` : undefined}
        sizes="(max-width: 700px) calc(50vw - 24px), (max-width: 1120px) calc(33vw - 28px), 340px"
        alt={guide.alt}
        width={800}
        height={600}
        loading="lazy"
        decoding="async"
      />
      <div><p>{guide.country}</p><h3>{guide.city} <span aria-hidden="true">↗</span></h3><span>{guide.days} days · View itinerary</span></div>
    </Link>)}</div>
  </section>;
}

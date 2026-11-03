import Link from "next/link";
import { CITY_GUIDES, GUIDE_PHOTOS, guideCardImage } from "@/server/examples/city-guides";

const IDEAS = [...CITY_GUIDES.map(g => ({ slug: g.slug, country: g.country, city: g.city, days: 4 })), { slug: "lisbon-porto", country: "Portugal", city: "Lisbon & Porto", days: 6 }];

export function TripIdeas() {
  return <section className="trip-ideas" id="trip-ideas" aria-labelledby="trip-ideas-title">
    <div className="guide-section-heading"><h2 id="trip-ideas-title">Explore trip ideas.</h2><p>Ready-made itineraries to make your own</p></div>
    <div className="trip-idea-grid six">{IDEAS.map(guide => {
      const photo = GUIDE_PHOTOS[`${guide.slug}-card`];
      const preview = `/editorial/city-guides/${guide.slug}-card-small.webp?v=full-frame-20261027`;
      return <Link className="trip-idea" href={`/examples/${guide.slug}`} key={guide.slug}>
        <img
          src={preview}
          srcSet={`${preview} 800w, ${guideCardImage(guide.slug)} 2000w`}
          sizes="(max-width: 700px) calc(50vw - 24px), (max-width: 1120px) calc(33vw - 28px), 340px"
          alt={photo.description}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
        />
        <div><p>{guide.country}</p><h3>{guide.city} <span aria-hidden="true">↗</span></h3><span>{guide.days} days · View itinerary</span></div>
      </Link>;
    })}</div>
  </section>;
}

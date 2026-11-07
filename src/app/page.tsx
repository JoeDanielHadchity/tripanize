import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { PublicHeader } from "@/components/public-header";
import { LinkButton } from "@/components/ui";
import { FlightExplainer } from "@/components/flight-explainer";
import { publicMetadata, PUBLIC_PAGES, SITE_STRUCTURED_DATA } from "@/lib/seo";
import { TripIdeas } from "@/components/guides/trip-ideas";
import { getSiteTexts } from "@/server/admin/texts";

export const metadata = publicMetadata("/", PUBLIC_PAGES["/"]);

export default async function Home() {
  if (await getSessionUser()) redirect("/start");
  const t = await getSiteTexts();
  return <div className="home-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_STRUCTURED_DATA).replace(/</g, "\\u003c") }} />
    <PublicHeader currentPath="/" />
    <main id="main" className="home-content">
      <section className="hero-ticket" aria-labelledby="home-title"><span className="ticket-tape" aria-hidden="true" />
        <div className="hero-ticket-main"><div className="travel-window"><img decoding="async" src="/editorial/home.webp" alt="Porto waterfront on the Douro River" width={340} height={480} fetchPriority="high" /></div>
          <div className="hero-copy"><h1 id="home-title">{t["web.home.title1"]}<br /><em>{t["web.home.title2"]}</em></h1><p>{t["web.home.subtitle"]}</p><div className="hero-actions"><LinkButton href="/sign-up" variant="primary">{t["web.home.cta"]} <span aria-hidden="true">→</span></LinkButton><LinkButton href="/examples/lisbon-porto">{t["web.home.example"]}</LinkButton></div><a href="#how-it-works" className="hero-watch">Watch how it works <span aria-hidden="true">↓</span></a></div>
        </div>
        <div className="hero-stub" role="group" aria-label="Example trip to Porto"><div className="hero-airports">LIS <span aria-hidden="true">→</span> OPO</div><div><p className="ticket-label">Destination</p><p className="font-display text-2xl font-medium">Porto</p><p className="mt-2 text-xs text-muted">4 days · 3 travelers</p><p className="text-xs text-muted">Example trip</p></div><div className="ticket-barcode" aria-hidden="true" /></div>
      </section>
      <FlightExplainer />
      <TripIdeas />
      <section className="home-features" aria-labelledby="features-title"><h2 id="features-title">{t["web.home.features"]}</h2><div>
        <article><span className="feature-number">01</span><h3>{t["web.home.f1.title"]}</h3><p>{t["web.home.f1.text"]}</p></article>
        <article><span className="feature-number">02</span><h3>{t["web.home.f2.title"]}</h3><p>{t["web.home.f2.text"]}</p></article>
        <article><span className="feature-number">03</span><h3>{t["web.home.f3.title"]}</h3><p>{t["web.home.f3.text"]}</p></article>
      </div></section>
      <section className="home-fare"><div><h2>{t["web.home.fare.title"]}</h2><p>{t["web.home.fare.text"]}</p></div><p className="home-price">$15 <small>/ trip</small></p><LinkButton href="/plans">Compare plans <span aria-hidden="true">→</span></LinkButton></section>
    </main>
  </div>;
}

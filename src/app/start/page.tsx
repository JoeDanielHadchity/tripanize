import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/shell";
import { requireUser } from "@/server/auth/session";
import { userTrialAccess } from "@/server/admin/trials";
import { TrialAccessBanner } from "@/components/trial-access";

export const metadata: Metadata = { title: "Where do you want to go?" };

export default async function StartPage() {
  const user = await requireUser();
  const trial = await userTrialAccess(user.id);
  return <><AppHeader user={user} /><main id="main" className="mx-auto max-w-5xl px-4 pb-16 pt-9 sm:pt-12"><TrialAccessBanner access={trial} />
    <h1 className="start-heading">Where do you want to go?</h1>
    <div className="start-options"><Link href="/trips" aria-labelledby="known-title" className="start-choice"><div className="start-choice-art"><img decoding="async" fetchPriority="high" src="/editorial/start-mont-saint-michel.webp" alt="Mont Saint-Michel above the tidal bay in Normandy, France" width={2400} height={1200} /></div><div className="start-choice-copy"><h2 id="known-title">I have a destination</h2><span>My trips <span aria-hidden="true">→</span></span></div></Link>
      <Link href="/destinations" aria-labelledby="discover-title" className="start-choice"><div className="start-choice-art"><img decoding="async" loading="lazy" src="/editorial/start-amalfi-coast.webp" alt="Colorful Positano overlooking the blue Mediterranean on Italy’s Amalfi Coast" width={2400} height={1200} /></div><div className="start-choice-copy"><h2 id="discover-title">Help me choose</h2><span>Find a destination <span aria-hidden="true">→</span></span></div></Link></div>
  </main></>;
}

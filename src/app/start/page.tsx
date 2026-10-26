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
    <div className="start-options"><Link href="/trips" aria-labelledby="known-title" className="start-choice"><div className="start-choice-art"><img decoding="async" src="/editorial/welcome.webp" alt="Tiled streets in Porto" width={600} height={285} /></div><div className="start-choice-copy"><h2 id="known-title">I have a destination</h2><span>My trips <span aria-hidden="true">→</span></span></div></Link>
      <Link href="/destinations" aria-labelledby="discover-title" className="start-choice"><div className="start-choice-art explore-art"><div className="explore-ticket">Explore <span aria-hidden="true">↗</span></div></div><div className="start-choice-copy"><h2 id="discover-title">Help me choose</h2><span>Find a destination <span aria-hidden="true">→</span></span></div></Link></div>
  </main></>;
}

import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { PublicHeader } from "@/components/public-header";

export const metadata = { title: "Page not found", robots: { index: false, follow: false } };

/** Design 004 404: an ink "boarding pass" to nowhere, with ways back. */
export default async function NotFound() {
  const user = await getSessionUser().catch(() => null);
  return <>
    <PublicHeader user={user} />
    <main id="main" className="status-page">
      <div className="status-ticket">
        <p className="status-eyebrow">Error 404 · Off the map</p>
        <p className="status-code" aria-hidden="true">404</p>
        <h1>This page took a different route.</h1>
        <p>The link may be old, or the page was moved. Your trips are safe.</p>
        <div className="status-actions">
          {user ? <Link href="/trips" className="status-primary">Go to My trips</Link> : <Link href="/" className="status-primary">Go to the home page</Link>}
          <Link href="/examples" className="status-secondary">Browse trip ideas</Link>
        </div>
      </div>
    </main>
  </>;
}

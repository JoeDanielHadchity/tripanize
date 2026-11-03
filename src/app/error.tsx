"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page fails to load. Nothing in the trip is lost; trying again usually works. */
export default function ErrorPage({ error, reset, retry }: { error: unknown; reset?: () => void; retry?: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const again = retry ?? reset ?? (() => window.location.reload());
  return (
    <main id="main" className="status-page">
      <div className="status-ticket">
        <p className="status-eyebrow">Something went wrong</p>
        <p className="status-code" aria-hidden="true">Oops</p>
        <h1>We couldn’t load this page.</h1>
        <p>Your trips and changes are safe. Check your connection and try again.</p>
        <div className="status-actions">
          <button type="button" onClick={() => again()} className="status-primary">Try again</button>
          <Link href="/trips" className="status-secondary">Go to My trips</Link>
        </div>
      </div>
    </main>
  );
}

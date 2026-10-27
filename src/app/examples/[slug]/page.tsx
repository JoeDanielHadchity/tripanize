import type { Metadata } from "next";
import { publicMetadata } from "@/lib/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { EXAMPLES } from "@/server/examples/data";
import { Logo } from "@/components/shell";
import { Badge, LinkButton, Notice } from "@/components/ui";
import { formatDuration } from "@/lib/dates";
import { CopyExample } from "./copy";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const ex = EXAMPLES.find((e) => e.slug === slug);
  return ex ? publicMetadata(`/examples/${ex.slug}`, { title: `${ex.nights + 1}-Day ${ex.name} — Example Itinerary`, description: `${ex.summary} Explore this public sample itinerary, then save a copy to plan your own trip with Tripanize.` }) : { title: "Example not found", robots: { index: false, follow: false } };
}

export default async function ExamplePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ex = EXAMPLES.find((e) => e.slug === slug);
  if (!ex) notFound();
  const user = await getSessionUser();
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link href={user ? "/trips" : "/"}><Logo small /></Link>
        {user ? <LinkButton href="/trips" variant="ghost">My trips</LinkButton> : <LinkButton href="/sign-up" variant="primary">Get started</LinkButton>}
      </header>
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

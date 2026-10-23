import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/shell";
import { requireUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Where will you go next?" };

export default async function StartPage() {
  const user = await requireUser();
  return <>
    <AppHeader user={user} />
    <main id="main" className="mx-auto max-w-5xl px-4 pb-20 pt-10 sm:pt-16">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-ink">Your next adventure</p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight sm:text-5xl">Where will you go next?</h1>
        <p className="mt-4 text-lg text-muted">Already have a place in mind, or looking for a little inspiration? Choose where to start.</p>
      </div>
      <div className="mt-9 grid gap-5 sm:grid-cols-2">
        <Link href="/trips" aria-labelledby="known-title" aria-describedby="known-description" className="group flex flex-col rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-accent sm:p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink" aria-hidden="true"><svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 28s9-8 9-16a9 9 0 1 0-18 0c0 8 9 16 9 16Z" /><circle cx="16" cy="12" r="3" /></svg></span>
          <h2 id="known-title" className="mt-6 font-display text-2xl font-semibold">I have a destination in mind</h2>
          <p id="known-description" className="mt-3 text-sm leading-relaxed text-muted">Go to your trips to start a new plan or continue one you’ve already saved.</p>
          <span className="mt-7 pt-2 text-sm font-semibold text-accent-ink group-hover:underline">Go to my trips <span aria-hidden="true">→</span></span>
        </Link>
        <Link href="/destinations" aria-labelledby="discover-title" aria-describedby="discover-description" className="group flex flex-col rounded-3xl border border-accent/40 bg-accent-soft/30 p-6 transition-colors hover:border-accent sm:p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-on-accent" aria-hidden="true"><svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m4 8 8-3 8 3 8-3v19l-8 3-8-3-8 3V8Z" /><path d="M12 5v19M20 8v19M8 21c2-6 5-4 7-8s5 2 9-3" strokeDasharray="2 3" /></svg></span>
          <h2 id="discover-title" className="mt-6 font-display text-2xl font-semibold">Let me help you choose</h2>
          <p id="discover-description" className="mt-3 text-sm leading-relaxed text-muted">Not sure where to go? Share your dates, budget and preferences to discover five places that fit you.</p>
          <span className="mt-7 pt-2 text-sm font-semibold text-accent-ink group-hover:underline">Find my destination <span aria-hidden="true">→</span></span>
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted">Choose a suggested destination and we’ll save it in My trips, ready for you to continue planning.</p>
    </main>
  </>;
}

import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionUser } from "@/server/auth/session";
import { AppHeader, Logo } from "./shell";
import { LinkButton } from "./ui";
import { LEGAL_LINKS, OPERATOR_COUNTRY, OPERATOR_NAME, POLICY_UPDATED } from "@/lib/legal";

export async function PublicHeader() {
  const user = await getSessionUser();
  return user ? <AppHeader user={user} /> : <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
    <Link href="/" aria-label="Tripanize home"><Logo /></Link>
    <nav aria-label="Main" className="flex items-center gap-3"><Link href="/plans" className="text-sm text-muted hover:text-ink">Pricing</Link><LinkButton href="/sign-in">Sign in</LinkButton></nav>
  </header>;
}

export function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3"><h2 className="font-display text-xl font-semibold text-ink">{title}</h2><div className="space-y-3 text-[15px] leading-7 text-muted [&_a]:text-accent-ink [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{children}</div></section>;
}

export async function PolicyPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <><PublicHeader /><main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-8">
    <p className="text-sm font-semibold text-accent-ink">Tripanize policies</p>
    <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{title}</h1>
    <p className="mt-4 text-lg leading-8 text-muted">{intro}</p>
    <p className="mt-4 text-xs text-muted">Updated {POLICY_UPDATED} · Operated by {OPERATOR_NAME}, an individual based in {OPERATOR_COUNTRY}.</p>
    <nav aria-label="Policy pages" className="my-7 flex flex-wrap gap-x-5 border-y border-line py-2 text-sm">{LEGAL_LINKS.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-accent-ink underline underline-offset-4">{link.label}</Link>)}</nav>
    <article className="space-y-8">{children}</article>
  </main></>;
}

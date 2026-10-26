import Link from "next/link";
import { LEGAL_LINKS } from "@/lib/legal";

export function LegalFooter() {
  return <footer className="border-t-2 border-dashed border-line px-4 pb-24 pt-5 text-sm text-muted lg:pb-6">
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 sm:flex-row">
      <p className="font-hand text-xl text-ink/80">Tripanize · A little less planning. A lot more going.</p>
      <nav aria-label="Legal and support" className="flex flex-wrap justify-center gap-x-4">
        {LEGAL_LINKS.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-ink hover:underline">{link.label}</Link>)}
      </nav>
    </div>
  </footer>;
}

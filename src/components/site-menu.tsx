"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FEATURE_PAGES } from "@/lib/feature-pages";

const PAGES = [{ href: "/", label: "Home" }, { href: "/plans", label: "Plans" }, ...FEATURE_PAGES, { href: "/examples", label: "Trip ideas" }];

/** Phone and tablet menu: the site links behind one button instead of rows of links. */
export function SiteMenu({ extra }: { extra?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  return (
    <div ref={box} className="site-menu">
      <button type="button" className="site-menu-button" aria-expanded={open} aria-controls="site-menu-panel" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
        </svg>
      </button>
      {open && (
        <nav id="site-menu-panel" aria-label="Menu" className="site-menu-panel">
          {PAGES.map(page => <Link key={page.href} href={page.href} aria-current={pathname === page.href ? "page" : undefined} onClick={() => setOpen(false)}>{page.label}</Link>)}
          {extra}
        </nav>
      )}
    </div>
  );
}

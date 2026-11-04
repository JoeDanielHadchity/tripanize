"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * A folded section of a long settings page. It opens itself when the page address points at it
 * (#id) or at something inside it, so links like "settings#details" still land in the right place.
 */
export function Fold({ id, title, summary, children, defaultOpen = false, tone }: { id: string; title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; tone?: "danger" }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const sync = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash || !ref.current) return;
      const target = hash === id ? ref.current : ref.current.querySelector(`[id="${CSS.escape(hash)}"]`);
      if (!target) return;
      ref.current.open = true;
      requestAnimationFrame(() => target.scrollIntoView({ block: "start" }));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);
  return <details ref={ref} id={id} open={defaultOpen || undefined} className="group scroll-mt-20 rounded-2xl border border-line bg-surface">
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className={`block font-display text-lg font-semibold ${tone === "danger" ? "text-danger" : ""}`}>{title}</span>{summary && <span className="block text-sm text-muted">{summary}</span>}</span>
      <span aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-180">▾</span>
    </summary>
    <div className="border-t border-line px-4 pb-4 pt-4">{children}</div>
  </details>;
}

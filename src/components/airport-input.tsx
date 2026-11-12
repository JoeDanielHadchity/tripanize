"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Input, cx } from "./ui";
import type { AirportHit } from "@/lib/trip-wizard";

/** Type a city, airport or code (like flight search sites) and pick from the list. Free text still
 * works for train stations or anything else. */
export function AirportInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [hits, setHits] = useState<AirportHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState("");
  const listId = useId();
  const chosen = useRef(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/mobile/airports?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then(r => r.ok ? r.json() as Promise<{ airports: AirportHit[] }> : { airports: [] })
        .then(d => { setHits(d.airports); setActive(-1); })
        .catch(() => undefined);
    }, 150);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [query]);

  const pick = (a: AirportHit) => { chosen.current = true; onChange(a.label); setOpen(false); setHits([]); };
  const shown = open && query.trim().length >= 2 && hits.length > 0;

  return <div className="relative">
    <Input id={id} value={value} placeholder={placeholder} autoComplete="off" role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
      onChange={e => { onChange(e.target.value); setQuery(e.target.value); setOpen(true); if (e.target.value.trim().length < 2) setHits([]); }}
      onFocus={() => { if (!chosen.current) setOpen(true); }}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={e => {
        if (!shown) return;
        if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(hits.length - 1, a + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
        else if (e.key === "Enter" && active >= 0) { e.preventDefault(); pick(hits[active]); }
        else if (e.key === "Escape") setOpen(false);
      }} />
    {shown && <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-2xl border border-line bg-surface py-1 shadow-lg">
      {hits.map((a, i) => <li key={a.code} id={`${listId}-${i}`} role="option" aria-selected={i === active}
        onMouseDown={e => { e.preventDefault(); pick(a); }}
        className={cx("flex cursor-pointer items-center gap-3 px-4 py-2.5", i === active ? "bg-accent-soft" : "hover:bg-surface-2")}>
        <span className="w-11 shrink-0 rounded-md bg-surface-2 py-1 text-center text-xs font-bold tracking-wider">{a.code}</span>
        <span className="min-w-0"><span className="block truncate font-medium">{a.name}</span><span className="block truncate text-xs text-muted">{[a.city, a.country].filter(Boolean).join(", ")}</span></span>
      </li>)}
    </ul>}
  </div>;
}

import Link from "next/link";

export type ReadinessItem = { label: string; detail: string; done: boolean; href: string };

export function TripReadiness({ items }: { items: ReadinessItem[] }) {
  const done = items.filter(i => i.done).length;
  return <details className="mb-5 rounded-2xl border border-line bg-surface p-4">
    <summary className="cursor-pointer font-medium">Trip checklist <span className="ml-2 text-sm text-muted">{done} of {items.length} complete</span></summary>
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {items.map(i => <li key={i.label}><Link href={i.href} className="flex min-h-14 gap-3 rounded-xl border border-line p-3 hover:bg-surface-2">
        <span aria-label={i.done ? "Complete" : "To review"} className={i.done ? "text-accent-ink" : "text-warn-ink"}>{i.done ? "✓" : "○"}</span>
        <span><span className="block text-sm font-medium">{i.label}</span><span className="block text-xs text-muted">{i.detail}</span></span>
      </Link></li>)}
    </ul>
  </details>;
}

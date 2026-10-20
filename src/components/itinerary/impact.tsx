import { formatMoney } from "@/lib/money";
import type { ImpactData } from "./types";

/** Shows how a change affects the day before it's applied. */
export function ImpactSummary({ impact, currency, label }: { impact: ImpactData; currency: string; label?: string }) {
  const row = (name: string, a: string | number | null, b: string | number | null) =>
    a !== b ? (
      <li>
        <span className="text-muted">{name}:</span> {a ?? "—"} → <strong>{b ?? "—"}</strong>
      </li>
    ) : null;
  const changes = [
    row("Day starts", impact.startBefore, impact.startAfter),
    row("Day ends", impact.finishBefore, impact.finishAfter),
    row("Travel time (estimate, min)", impact.travelBefore, impact.travelAfter),
    impact.costBefore !== impact.costAfter ? row("Estimated cost", formatMoney(impact.costBefore, currency), formatMoney(impact.costAfter, currency)) : null,
  ].filter(Boolean);
  return (
    <div className="space-y-2 text-sm">
      {label && <p className="font-semibold">{label}</p>}
      {impact.conflicts.map((c, i) => (
        <p key={i} className={c.severity === "conflict" ? "rounded-lg bg-danger-soft px-3 py-2 text-danger" : "rounded-lg bg-warn-soft px-3 py-2 text-warn-ink"}>{c.message}</p>
      ))}
      {impact.bookingsAffected.length > 0 && <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn-ink">Affects booking(s): {impact.bookingsAffected.map((b) => `${b.title} (${b.status.toLowerCase()})`).join(", ")}. Roam only updates your plan — contact the provider to change a reservation.</p>}
      {changes.length > 0 && <ul className="space-y-0.5">{changes}</ul>}
      {impact.meals.length > 0 && <p>Meal timing: {impact.meals.map((m) => `${m.title} ${m.from ?? "—"} → ${m.to ?? "—"}`).join("; ")}</p>}
      {impact.moved.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted">{impact.moved.length} stop time(s) change</summary>
          <ul className="mt-1 space-y-0.5">{impact.moved.map((m) => <li key={m.id}>{m.title}: {m.from ?? "—"} → {m.to ?? "—"}</li>)}</ul>
        </details>
      )}
      {!changes.length && !impact.moved.length && !impact.conflicts.length && <p className="text-muted">No timing changes for other stops.</p>}
    </div>
  );
}

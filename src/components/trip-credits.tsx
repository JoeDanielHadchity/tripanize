"use client";

import { Card } from "@/components/ui";
import { useAction } from "@/components/client";
import { setMembersUseCreditsAction } from "@/app/actions/credits";

/** Trip settings, organizer only: whether editors may use the organizer's credits, and who spent what here. */
export function TripCreditsCard({ tripId, membersUseCredits, spending }: { tripId: string; membersUseCredits: boolean; spending: { userId: string | null; name: string; actions: number; credits: number }[] }) {
  const { run, pending } = useAction();
  return <Card>
    <h3 className="font-semibold">AI credits on this trip</h3>
    <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-medium">
      <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={membersUseCredits} disabled={pending} onChange={e => run(() => setMembersUseCreditsAction(tripId, e.target.checked), { success: e.target.checked ? "Editors can use your credits" : "Editors can't use your credits now" })} />
      Editors can use my credits for AI on this trip
    </label>
    <p className="text-xs text-muted">Viewers never use your credits. Turning this off stops editors' AI requests here; everything else keeps working.</p>
    <h4 className="mt-4 text-sm font-semibold">Spent on this trip</h4>
    {spending.length === 0 ? <p className="mt-1 text-sm text-muted">No credits spent here yet.</p> : <ul className="mt-1 divide-y divide-line text-sm">
      {spending.map(s => <li key={s.userId ?? s.name} className="flex justify-between gap-3 py-2"><span>{s.name} · {s.actions} AI action{s.actions === 1 ? "" : "s"}</span><span className="font-bold tabular-nums">{s.credits} credits</span></li>)}
    </ul>}
  </Card>;
}

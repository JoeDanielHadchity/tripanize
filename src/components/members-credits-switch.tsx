"use client";

import { useAction } from "@/components/client";
import { setMembersUseCreditsAction } from "@/app/actions/credits";

/** Account › Credits: whether editors of one of your trips may use your credits for AI there. */
export function MembersCreditsSwitch({ tripId, on }: { tripId: string; on: boolean }) {
  const { run, pending } = useAction();
  return <label className="flex min-h-11 items-center gap-2 text-sm">
    <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={on} disabled={pending} onChange={e => run(() => setMembersUseCreditsAction(tripId, e.target.checked), { success: e.target.checked ? "Editors can use your credits on this trip" : "Editors can't use your credits on this trip now" })} />
    Editors can use my credits
  </label>;
}

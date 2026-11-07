"use client";
import { useState } from "react";
import { useAction } from "@/components/client";
import { newsEmailsAction } from "@/app/actions/news";

/** Off by default; the person chooses. */
export function NewsEmailSetting({ initial }: { initial: boolean }) {
  const { run, pending } = useAction(); const [on, setOn] = useState(initial);
  return <label className="flex cursor-pointer items-start gap-3">
    <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--color-accent)]" checked={on} disabled={pending} onChange={async e => { const next = e.target.checked; setOn(next); if (await run(() => newsEmailsAction(next), { success: next ? "You'll get Tripanize news by email" : "Tripanize news emails are off" }) === null) setOn(!next); }} />
    <span><span className="block text-sm font-medium">Email me Tripanize news</span><span className="block text-sm text-muted">New features, trip ideas and the occasional offer. A few times a month at most. Unsubscribe any time.</span></span>
  </label>;
}

"use client";

import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { useAction } from "@/components/client";
import { acceptInviteAction } from "@/app/actions/members";

export function AcceptInvite({ token, userEmail }: { token: string; userEmail: string }) {
  const { run, pending } = useAction();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm">You're signed in as <strong>{userEmail}</strong>.</p>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button variant="primary" disabled={pending} onClick={async () => {
        const r = await run(() => acceptInviteAction(token), { refresh: false, onError: (e) => setError(e.error) });
        if (r) window.location.assign(`/trips/${r.tripId}/itinerary`);
      }}>{pending ? "Joining…" : "Accept invitation"}</Button>
    </div>
  );
}

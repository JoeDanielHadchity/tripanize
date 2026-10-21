"use client";

import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { useAction } from "@/components/client";
import { acceptInviteByIdAction, declineInviteAction } from "@/app/actions/members";
import { formatDateRange } from "@/lib/dates";

type Invite = { id: string; tripName: string; startDate: string | null; endDate: string | null; role: string; from: string };

// Invitations sent to the signed-in email: join or decline straight from the trips list.
export function PendingInvites({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const { run, pending } = useAction();
  if (!invites.length) return null;
  return (
    <Card className="mb-6 border-accent">
      <h2 className="font-display text-xl font-semibold">You're invited</h2>
      <ul className="mt-3 divide-y divide-line">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-semibold">{i.tripName}</p>
              <p className="text-sm text-muted">{i.from} invited you{i.startDate ? ` · ${formatDateRange(i.startDate, i.endDate)}` : ""} · {i.role === "VIEWER" ? "view only" : "can edit"}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" disabled={pending} onClick={async () => { const r = await run(() => acceptInviteByIdAction(i.id), { success: `You joined “${i.tripName}”` }); if (r) router.push(`/trips/${r.tripId}`); }}>Join</Button>
              <Button variant="ghost" disabled={pending} onClick={() => run(() => declineInviteAction(i.id), { success: "Invitation declined" })}>Decline</Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

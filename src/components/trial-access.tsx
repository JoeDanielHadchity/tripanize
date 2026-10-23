"use client";
import { useAction } from "./client";
import { Badge, Button, Card, LinkButton, Notice } from "./ui";
import { acceptTrialAction } from "@/app/actions/trials";
import type { UserTrialAccess } from "@/server/admin/trials";

export function ActivateTrialButton({ invitationId, tripId, durationDays }: { invitationId: string; tripId: string; durationDays: number | null }) {
  const { run, pending } = useAction();
  return <Button variant="primary" disabled={pending} onClick={async () => {
    const result = await run(() => acceptTrialAction({ invitationId, tripId }), { refresh: false });
    if (result) window.location.assign(`/trips/${result.tripId}`);
  }}>{pending ? "Activating Premium…" : durationDays ? `Start ${durationDays}-day Premium trial · $0` : "Activate included Premium · $0"}</Button>;
}

export function TrialAccessBanner({ access, tripId, canActivate = false, showVerification = true }: { access: UserTrialAccess; tripId?: string; canActivate?: boolean; showVerification?: boolean }) {
  if (access.status === "none") return null;
  if (access.status === "verify") return showVerification ? <Notice className="mb-5" title="Have a Premium trial invitation?"><p>Verify your email with a sign-in code to find and use your trial. A password alone does not verify the invited email address.</p><LinkButton href={`/sign-in?reauth=1&next=${encodeURIComponent(tripId ? `/trips/${tripId}/premium` : "/start")}`} className="mt-3">Verify my email</LinkButton></Notice> : null;
  if (access.status === "active") return <Card className="mb-5 border-accent bg-accent-soft/30"><Badge tone="accent">Premium trial active</Badge><p className="mt-3 font-semibold">{access.tripName}</p><p className="mt-2 text-sm text-muted">Every Premium feature is included for this trip and its members, with no payment required.{access.endsAt ? ` Access ends ${new Date(access.endsAt).toLocaleString("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" })} (Riyadh time).` : " Access lasts until revoked."}</p>{tripId !== access.tripId && <><p className="mt-2 text-xs text-muted">Your invitation covers this trip. Other trips keep their own plans.</p><LinkButton href={`/trips/${access.tripId}`} variant="primary" className="mt-3">Open my Premium trial trip</LinkButton></>}</Card>;
  if (access.status !== "available") return null;
  return <Card className="mb-5 border-accent bg-accent-soft/30"><Badge tone="accent">{access.durationDays ? `${access.durationDays}-day Premium trial` : "Premium trial invitation"}</Badge><h2 className="mt-3 font-display text-xl font-semibold">Your Premium invitation is ready</h2><p className="mt-2 text-sm text-muted">Unlock every Premium feature for one trip and everyone you invite. No card, payment or automatic charge.{access.durationDays ? ` Your full ${access.durationDays} days start when you activate the trial.` : " Access lasts until revoked."}</p><div className="mt-4 flex flex-wrap gap-3">{tripId && canActivate ? <ActivateTrialButton invitationId={access.invitationId} tripId={tripId} durationDays={access.durationDays} /> : <><LinkButton href="/trips/new" variant="primary">Start my free Premium trip</LinkButton><LinkButton href={`/trial?invitation=${encodeURIComponent(access.invitationId)}`}>Use an existing trip</LinkButton></>}</div><p className="mt-3 text-xs text-muted">Activate the invitation by {new Date(access.acceptBy).toLocaleDateString("en-GB", { timeZone: "Asia/Riyadh", dateStyle: "medium" })}.</p></Card>;
}

"use client";
import { useState } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { useAction } from "@/components/client";
import { acceptTrialAction } from "@/app/actions/trials";
export function TrialClaim({ invitationId, trips, durationDays = 14 }: { invitationId: string; trips: { id: string; name: string }[]; durationDays?: number | null }) {
  const { run, pending } = useAction();
  const [tripId, setTripId] = useState("");
  const [name, setName] = useState("");
  return <form className="mt-4 space-y-4" onSubmit={async e => {
    e.preventDefault();
    const result = await run(() => acceptTrialAction({ invitationId, ...(tripId ? { tripId } : { name }) }), { refresh: false });
    if (result) window.location.assign(`/trips/${result.tripId}`);
  }}>
    <Field label="Use your trial for" htmlFor={`trial-trip-${invitationId}`}><Select id={`trial-trip-${invitationId}`} value={tripId} onChange={e => setTripId(e.target.value)}><option value="">A new trip</option>{trips.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
    {!tripId && <Field label="Trip name" htmlFor={`trial-name-${invitationId}`}><Input id={`trial-name-${invitationId}`} required maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="My next adventure" /></Field>}
    <p className="text-xs text-muted">{durationDays ? `All Premium features unlock for ${durationDays} full days from activation, for this trip and its members.` : "All Premium features unlock for this trip and its members until revoked."} No card or payment is needed. This invitation cannot move to another trip after activation.</p>
    <Button variant="primary" type="submit" disabled={pending}>{pending ? "Activating…" : durationDays ? `Start my ${durationDays}-day Premium trial · $0` : "Activate my free Premium trial"}</Button>
  </form>;
}

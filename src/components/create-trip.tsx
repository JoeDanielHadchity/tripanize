"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Notice } from "./ui";
import { createDraftAction } from "@/app/actions/onboarding";
export function CreateTrip({ trial }: { trial?: { invitationId: string; durationDays: number | null } }) {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  return <Card><form className="space-y-5" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const result = await createDraftAction(name, trial?.invitationId); if (!result.ok) throw new Error(result.error); if (result.data.trial) window.location.assign(result.data.next); else router.push(result.data.next); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); setBusy(false); } }}>
    <Field label="Trip name" htmlFor="trip-name" hint="You can change this later."><Input id="trip-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder="e.g. Our summer escape" autoComplete="off" /></Field>
    <p className="text-sm text-muted">{trial ? `Next: your free Premium trial opens immediately for this trip. ${trial.durationDays ? `All Premium features are included for ${trial.durationDays} days from activation.` : "All Premium features are included until revoked."} No payment details are needed.` : "Choose your plan next. Standard is free; Premium is $15 per trip."}</p>
    <Button type="submit" variant="primary" disabled={busy}>{busy ? "Creating…" : trial ? "Create trial trip" : "Continue to plans"}</Button>
    {error && <Notice tone="danger">{error}</Notice>}
  </form></Card>;
}

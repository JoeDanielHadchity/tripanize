"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Notice } from "./ui";
import { createDraftAction } from "@/app/actions/onboarding";
export function CreateTrip() {
  const [name, setName] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const router = useRouter();
  return <Card><form className="space-y-5" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { const result = await createDraftAction(name); if (!result.ok) throw new Error(result.error); router.push(`/trips/${result.data.id}/premium?created=1`); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); setBusy(false); } }}>
    <Field label="Trip name" htmlFor="trip-name" hint="You can change this later. Destination and travel details come after choosing your plan."><Input id="trip-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} placeholder="e.g. Our summer escape" autoComplete="off" /></Field>
    <p className="text-sm text-muted">Next: compare Normal and Premium. Choose free planning or a complete Premium trip for $15, for any group size.</p>
    <Button type="submit" variant="primary" disabled={busy}>{busy ? "Creating…" : "Create trip & choose plan"}</Button>
    {error && <Notice tone="danger">{error}</Notice>}
  </form></Card>;
}

"use client";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { Dialog, useAction, useConfirm } from "@/components/client";
import { castVoteAction, createPollAction, decidePollAction } from "@/app/actions/voting";
import type { PollView } from "@/lib/voting";

type Props = { tripId: string; polls: PollView[]; canCreate: boolean; canDecide: boolean; suggestions: { DESTINATION: string[]; ACTIVITY: string[] } };
export function VotesView({ tripId, polls, canCreate, canDecide, suggestions }: Props) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<"DESTINATION" | "ACTIVITY">("ACTIVITY");
  const [choices, setChoices] = useState("");
  const [decision, setDecision] = useState<PollView | null>(null);
  const [archived, setArchived] = useState(false);
  const shown = polls.filter(p => archived ? p.status === "ARCHIVED" : p.status !== "ARCHIVED");
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">Let the group choose</h2><p className="mt-1 text-sm text-muted">Vote on destinations or activities. Each member has one vote per question and can change it until the organizer decides.</p></div>{canCreate && <Button variant="primary" onClick={() => { setChoices(""); setCreating(true); }}>+ Create vote</Button>}</div>
    <Notice tone="neutral">Voting is included for every trip, including viewers. Results show totals; only the organizer can finalize or reopen a decision. Finalizing records the choice so the group can plan it together.</Notice>
    <div className="flex gap-2" role="group" aria-label="Filter group votes"><Button aria-pressed={!archived} onClick={() => setArchived(false)}>Active & decided</Button><Button aria-pressed={archived} onClick={() => setArchived(true)}>Archived</Button></div>
    {!shown.length && <EmptyState title={archived ? "No archived votes" : "Make your next decision together"}>{canCreate ? "Create a destination or activity question with 2–8 choices. You can use suggestions already in the trip or add your own." : "The organizer or an editor can create a vote. You can then choose your favorite."}</EmptyState>}
    {shown.map(p => <Card key={p.id} className="space-y-4" id={`vote-${p.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted">{p.kind === "DESTINATION" ? "Destination" : "Activity"}</p><h3 className="mt-1 font-display text-lg font-semibold">{p.question}</h3></div><Badge tone={p.status === "DECIDED" ? "sage" : "neutral"}>{p.status === "OPEN" ? "Voting open" : p.status === "DECIDED" ? "Organizer decided" : "Archived"}</Badge></div>
      <div className="space-y-2" role="group" aria-label={`Choices for ${p.question}`}>
        {p.options.map(o => <button key={o.id} type="button" disabled={pending || p.status !== "OPEN"} aria-pressed={p.myOptionId === o.id} aria-label={`${o.label}, ${o.count} vote${o.count === 1 ? "" : "s"}${p.myOptionId === o.id ? ", your choice" : ""}`} onClick={() => run(() => castVoteAction(tripId, p.id, o.id, p.version), { success: "Your vote was saved" })} className={cx("relative min-h-14 w-full overflow-hidden rounded-xl border p-3 text-left disabled:cursor-default", p.chosenOptionId === o.id || p.myOptionId === o.id ? "border-accent" : "border-line")}>
          <span aria-hidden className="absolute inset-y-0 left-0 bg-accent-soft" style={{ width: `${p.totalVotes ? o.count / p.totalVotes * 100 : 0}%` }} />
          <span className="relative flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words font-medium">{o.label}{p.myOptionId === o.id ? " · Your vote" : ""}{p.chosenOptionId === o.id ? " · Final choice ✓" : ""}</span><span className="shrink-0 tabular-nums text-muted">{o.count} {o.count === 1 ? "vote" : "votes"}</span></span>
        </button>)}
      </div>
      <p className="text-xs text-muted">{p.totalVotes} member{p.totalVotes === 1 ? "" : "s"} voted · Current members only</p>
      {p.status === "DECIDED" && p.decisionNote && <p className="whitespace-pre-wrap break-words rounded-xl bg-surface-2 p-3 text-sm">Organizer’s note: {p.decisionNote}</p>}
      <div className="flex flex-wrap gap-2">
        {p.myOptionId && p.status === "OPEN" && <Button variant="ghost" disabled={pending} onClick={() => run(() => castVoteAction(tripId, p.id, null, p.version), { success: "Your vote was withdrawn" })}>Withdraw my vote</Button>}
        {canDecide && p.status === "OPEN" && <Button disabled={pending} onClick={() => setDecision(p)}>Finalize a choice</Button>}
        {canDecide && p.status !== "OPEN" && <Button disabled={pending} onClick={() => run(() => decidePollAction(tripId, p.id, "REOPEN", null, null, p.version), { success: "Vote reopened. Previous votes were kept." })}>Reopen / undo decision</Button>}
        {canDecide && p.status !== "ARCHIVED" && <Button variant="ghost" disabled={pending} onClick={async () => { if (await confirm({ title: "Archive this vote?", message: "It will move to Archived. You can reopen it later with the previous votes kept.", confirmLabel: "Archive" })) run(() => decidePollAction(tripId, p.id, "ARCHIVE", null, null, p.version), { success: "Vote archived" }); }}>Archive</Button>}
      </div>
    </Card>)}
    <Dialog open={creating} onClose={() => setCreating(false)} title="Create a group vote">
      <form className="space-y-4" onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); const result = await run(() => createPollAction(tripId, { question: String(form.get("question")), kind, options: choices.split("\n").map(s => s.trim()).filter(Boolean) }), { success: "Vote created" }); if (result !== null) setCreating(false); }}>
        <Field label="What are we deciding?" htmlFor="poll-question"><Input id="poll-question" name="question" required minLength={3} maxLength={160} placeholder="Which activity should we do on Saturday?" /></Field>
        <Field label="Vote about" htmlFor="poll-kind"><Select id="poll-kind" value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="ACTIVITY">Activities</option><option value="DESTINATION">Destinations</option></Select></Field>
        <Field label="Choices" htmlFor="poll-choices" hint="One choice per line · 2–8 different choices · 160 characters per choice"><Textarea id="poll-choices" rows={5} value={choices} onChange={e => setChoices(e.target.value)} required maxLength={1300} placeholder={kind === "DESTINATION" ? "Lisbon\nBarcelona\nNice" : "Food tour\nBoat trip\nMuseum visit"} /></Field>
        {suggestions[kind].length > 0 && <Field label={kind === "DESTINATION" ? "Add a destination idea" : "Add a trip suggestion"} htmlFor="poll-suggestion" hint={kind === "DESTINATION" ? "Includes your own saved search ideas. Only choices you add here will be shared in the vote." : undefined}><Select id="poll-suggestion" value="" onChange={e => { if (e.target.value) setChoices(v => [...new Set([...v.split("\n").map(s => s.trim()).filter(Boolean), e.target.value])].join("\n")); }}><option value="">Choose a suggestion…</option>{suggestions[kind].map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>}
        <div className="flex justify-end gap-2"><Button onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>Create vote</Button></div>
      </form>
    </Dialog>
    <Dialog key={decision?.id ?? "none"} open={Boolean(decision)} onClose={() => setDecision(null)} title="Finalize the group’s choice">
      {decision && <form className="space-y-4" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const result = await run(() => decidePollAction(tripId, decision.id, "DECIDE", String(f.get("choice")), String(f.get("note") ?? ""), decision.version), { success: "Decision saved. You can reopen it at any time." }); if (result !== null) setDecision(null); }}>
        <p className="text-sm">{decision.question}</p><Field label="Your final choice" htmlFor="poll-final"><Select id="poll-final" name="choice" required defaultValue=""><option value="" disabled>Choose an option…</option>{decision.options.map(o => <option key={o.id} value={o.id}>{o.label} ({o.count} votes)</option>)}</Select></Field>
        <Field label="Note to the group (optional)" htmlFor="poll-note"><Textarea id="poll-note" name="note" maxLength={500} /></Field><p className="text-xs text-muted">This records your decision and closes voting. Add the chosen destination or activity to the plan when you’re ready.</p>
        <div className="flex justify-end gap-2"><Button onClick={() => setDecision(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>Confirm decision</Button></div>
      </form>}
    </Dialog>
  </div>;
}

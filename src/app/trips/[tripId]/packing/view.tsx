"use client";

import { useState } from "react";
import { CreditPrice } from "@/components/credits";
import { CREDIT_PRICES } from "@/lib/credits";
import { Button, Card, Field, Input, LinkButton, Notice, Select, cx } from "@/components/ui";
import { PremiumStar } from "@/components/premium-star";
import { useAction, useConfirm } from "@/components/client";
import { addPackingAction, refreshPackingAction, removePackingAction, updatePackingAction } from "@/app/actions/packing";
import { addTaskAction, deleteTaskAction, toggleTaskAction } from "@/app/actions/trips";
import { PACKING_CATEGORIES } from "@/lib/constants";
import { formatDate } from "@/lib/dates";

type Item = { id: string; version: number; label: string; category: string; quantity: number; packed: boolean; source: string; reason: string | null };
type Task = { id: string; version: number; title: string; done: boolean; dueDate: string | null; assigneeId: string | null };

function List({ tripId, title, items, shared, editable, emptyText }: { tripId: string; title: string; items: Item[]; shared: boolean; editable: boolean; emptyText: string }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("Misc");
  const [editing, setEditing] = useState<string | null>(null);
  // Optimistic checkmarks: flip immediately, roll back if the server rejects the change.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const packed = (i: Item) => optimistic[i.id] ?? i.packed;
  const toggle = async (i: Item) => {
    const next = !packed(i);
    setOptimistic((o) => ({ ...o, [i.id]: next }));
    await run(() => updatePackingAction(tripId, i.id, { packed: next }, i.version));
    setOptimistic((o) => {
      const { [i.id]: _, ...rest } = o;
      return rest;
    });
  };
  const done = items.filter(packed).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const cats = [...new Set(items.map((i) => i.category))].sort();
  return (
    <Card>
      {/* Design 004: a progress ring that fills as items are packed. */}
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${title} progress`}>
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90" aria-hidden="true"><circle cx="40" cy="40" r="33" fill="none" strokeWidth="9" className="stroke-surface-2" /><circle cx="40" cy="40" r="33" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-accent" strokeDasharray={`${(pct / 100) * 207.3} 207.3`} /></svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-extrabold">{done}/{items.length}</span>
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-extrabold">{title}</h2>
          <p className="text-sm font-semibold text-muted">{done} of {items.length} packed</p>
        </div>
      </div>
      {editable && (
        <form className="mt-4 flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (!label.trim()) return; const r = await run(() => addPackingAction(tripId, { label, category, shared })); if (r !== null) setLabel(""); }}>
          <Input aria-label={`Add to ${title}`} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Add an item" className="min-w-40 flex-1" maxLength={120} />
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto">{PACKING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
          <Button type="submit" disabled={pending}>Add</Button>
        </form>
      )}
      {items.length === 0 && <p className="mt-4 text-sm text-muted">{emptyText}</p>}
      {cats.map((c) => (
        <div key={c} className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{c}</h3>
          <ul className="mt-1 divide-y divide-line">
            {items.filter((i) => i.category === c).map((i) => (
              <li key={i.id} className="flex items-start gap-3 py-2">
                <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-[var(--accent)]" aria-label={`Packed: ${i.label}`} checked={packed(i)} disabled={!editable} onChange={() => toggle(i)} />
                <div className="min-w-0 flex-1">
                  {editing === i.id ? (
                    <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await run(() => updatePackingAction(tripId, i.id, { label: String(f.get("label")), category: String(f.get("category")), quantity: Number(f.get("qty")) || 1 }, i.version), { success: "Saved" }); if (r !== null) setEditing(null); }}>
                      <Input name="label" aria-label="Item" defaultValue={i.label} className="flex-1" />
                      <Select name="category" aria-label="Category" defaultValue={i.category} className="w-auto">{PACKING_CATEGORIES.map((x) => <option key={x}>{x}</option>)}</Select>
                      <Input name="qty" aria-label="Quantity" type="number" min={1} max={99} defaultValue={i.quantity} className="w-20" />
                      <Button type="submit" variant="primary">Save</Button>
                      <Button onClick={() => setEditing(null)}>Cancel</Button>
                    </form>
                  ) : (
                    <>
                      <p className={cx("text-[15px]", packed(i) && "text-muted line-through")}>{i.label}{i.quantity > 1 && !/×/.test(i.label) ? ` × ${i.quantity}` : ""}</p>
                      {i.reason && <p className="text-xs text-muted">{i.source === "suggested" ? "Suggested: " : ""}{i.reason}</p>}
                    </>
                  )}
                </div>
                {editable && editing !== i.id && (
                  <div className="flex shrink-0">
                    <button type="button" className="min-h-10 rounded-lg px-2 text-sm text-muted hover:bg-surface-2" onClick={() => setEditing(i.id)} aria-label={`Edit ${i.label}`}>Edit</button>
                    <button type="button" className="min-h-10 rounded-lg px-2 text-sm text-muted hover:bg-surface-2" aria-label={`Remove ${i.label}`} onClick={async () => { if (await confirm({ title: "Remove item?", message: `Remove “${i.label}”?${i.source === "suggested" ? " It won't be suggested again." : ""}`, confirmLabel: "Remove", danger: true })) run(() => removePackingAction(tripId, i.id)); }}>✕</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Card>
  );
}

export function PackingView({ tripId, canEditShared, premium, personal, shared, tasks, travelers }: { tripId: string; canEditShared: boolean; premium: boolean; personal: Item[]; shared: Item[]; tasks: Task[]; travelers: { id: string; name: string }[] }) {
  const { run, pending } = useAction();
  const [laundry, setLaundry] = useState<"" | "yes" | "no">("");
  const [result, setResult] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <List tripId={tripId} title="My packing list" items={personal} shared={false} editable emptyText="Only you can see this list." />
        <List tripId={tripId} title="Shared group list" items={shared} shared editable={canEditShared} emptyText="Things the group needs once, like a first-aid kit or adapters." />
      </div>
      {premium && <Card className="bg-ai-soft/60">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">Packing suggestions <PremiumStar /></h2>
        <p className="mt-1 text-sm text-muted">A list made for this trip's places, dates, weather and plans. Your own items and checkmarks are always kept.</p>
        <details className="mt-1 text-sm text-muted"><summary className="cursor-pointer font-semibold">How it works</summary><p className="mt-1">It uses your destinations, local customs, events, travel preferences, dates and season, trip length, weather (live forecast within 14 days, otherwise typical conditions, always labeled), planned activities, road-trip and accommodation changes, and preferences you've shared. Refreshing never re-adds items you removed and doesn't create duplicates.</p></details>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Laundry during the trip?" htmlFor="laundry"><Select id="laundry" value={laundry} onChange={(e) => setLaundry(e.target.value as "" | "yes" | "no")} className="w-auto"><option value="">Not sure</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
          <Button variant="primary" disabled={pending} onClick={async () => {
            const r = await run(() => refreshPackingAction(tripId, laundry === "" ? null : laundry === "yes"));
            if (r) setResult(`${r.added ? `Added ${r.added} new suggestion${r.added === 1 ? "" : "s"}.` : "No new suggestions — your lists already cover them."}${r.weatherUsed ? "" : " Weather data wasn't available, so weather-based items rely on the season only."}`);
          }}><PremiumStar className="text-current" />{pending ? "Working…" : personal.length || shared.length ? "Refresh suggestions" : "Suggest a packing list"}<CreditPrice credits={CREDIT_PRICES.packing} tripId={tripId} /></Button>
        </div>
        {result && <Notice tone="accent" className="mt-3">{result}</Notice>}
      </Card>}
      {!premium && <Card><h2 className="flex items-center gap-2 font-display text-lg font-semibold">Packing suggestions <PremiumStar /></h2><p className="mt-1 text-sm text-muted">Add your own items above for free, or choose Premium suggestions tailored to your trip.</p><LinkButton href={`/trips/${tripId}/premium#feature-packing`} className="mt-3">Choose packing suggestions <PremiumStar /></LinkButton></Card>}
      <Tasks tripId={tripId} tasks={tasks} travelers={travelers} editable={canEditShared} />
    </div>
  );
}

function Tasks({ tripId, tasks, travelers, editable }: { tripId: string; tasks: Task[]; travelers: { id: string; name: string }[]; editable: boolean }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState("");
  return (
    <Card>
      <h2 className="font-display text-lg font-semibold">Trip prep checklist</h2>
      <p className="text-sm text-muted">Shared to-dos before you go — visas, insurance, pet sitter, offline maps…</p>
      <ul className="mt-3 divide-y divide-line">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-2">
            <input type="checkbox" className="h-6 w-6 accent-[var(--sage)]" aria-label={`Done: ${t.title}`} checked={t.done} disabled={!editable || pending} onChange={() => run(() => toggleTaskAction(tripId, t.id, !t.done, t.version))} />
            <span className={cx("flex-1", t.done && "text-muted line-through")}>{t.title}<span className="block text-xs text-muted">{[t.dueDate ? `Due ${formatDate(t.dueDate)}` : null, t.assigneeId ? travelers.find((x) => x.id === t.assigneeId)?.name : null].filter(Boolean).join(" · ")}</span></span>
            {editable && <button type="button" aria-label={`Delete ${t.title}`} className="min-h-10 px-2 text-sm text-muted" onClick={() => run(() => deleteTaskAction(tripId, t.id))}>✕</button>}
          </li>
        ))}
        {tasks.length === 0 && <li className="py-2 text-sm text-muted">No tasks yet.</li>}
      </ul>
      {editable && (
        <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const r = await run(() => addTaskAction(tripId, { title, dueDate: String(f.get("due") || "") || null, assigneeId: String(f.get("who") || "") || null })); if (r !== null) setTitle(""); }}>
          <Input aria-label="New task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task" required />
          <Input aria-label="Due date" name="due" type="date" />
          <Select aria-label="Assign to" name="who" className="w-auto"><option value="">Anyone</option>{travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
          <Button type="submit" disabled={pending}>Add</Button>
        </form>
      )}
    </Card>
  );
}

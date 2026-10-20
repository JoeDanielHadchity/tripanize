"use client";

import { useState } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { Dialog, useAction } from "@/components/client";
import { addStopAction, updateStopAction } from "@/app/actions/itinerary";
import { STOP_CATEGORIES } from "@/lib/constants";
import { minorToDecimalString } from "@/lib/money";
import { ImpactSummary } from "./impact";
import type { ImpactData, StopView } from "./types";

type Props = { open: boolean; onClose: () => void; tripId: string; currency: string; stop?: StopView | null; dayId?: string | null; plan?: "A" | "B"; dayLabel?: string };

export function StopEditor({ open, onClose, tripId, currency, stop, dayId = null, plan = "A", dayLabel }: Props) {
  const { run, pending } = useAction();
  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const isBooking = Boolean(stop?.booking);

  function collect(form: HTMLFormElement) {
    const f = new FormData(form);
    const str = (k: string) => (f.get(k) === null ? undefined : String(f.get(k)));
    const num = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
    return {
      title: str("title"),
      category: str("category"),
      startTime: str("startTime") || null,
      durationMin: num("durationMin"),
      ...(isBooking ? {} : { address: str("address") || null, locationName: str("locationName") || null, travelToNextMin: num("travelToNextMin"), estCost: str("estCost") || null, officialUrl: str("officialUrl") || null, reason: str("reason") || null, isMeal: f.get("isMeal") === "on", indoor: f.get("indoor") === "on" ? true : null }),
      notes: str("notes") || null,
    };
  }

  async function save(input: Record<string, unknown>) {
    if (stop) {
      const ok = await run((confirmed) => updateStopAction(tripId, stop.id, input, stop.version, confirmed), { success: "Stop updated" });
      if (ok) close();
    } else {
      const ok = await run(() => addStopAction(tripId, dayId, plan, input as { title: string }), { success: dayId ? "Stop added" : "Idea saved" });
      if (ok !== null) close();
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = collect(e.currentTarget);
    if (stop && stop.dayId) {
      const r = await run(() => updateStopAction(tripId, stop.id, input, stop.version, false, true), { refresh: false });
      if (r?.impact?.material) {
        setDraft(input);
        setImpact(r.impact);
        return;
      }
      if (r === null) return;
    }
    await save(input);
  }

  function close() {
    setImpact(null);
    setDraft(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} title={stop ? `Edit “${stop.title}”` : dayId ? `Add a stop${dayLabel ? ` — ${dayLabel}` : ""}${plan === "B" ? " (Plan B)" : ""}` : "Add an unscheduled idea"}>
      {impact && draft ? (
        <div className="space-y-4">
          <p className="text-sm">This change affects the rest of the day:</p>
          <ImpactSummary impact={impact} currency={currency} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setImpact(null)}>Back</Button>
            <Button variant="primary" disabled={pending} onClick={() => save(draft)}>Apply change</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3">
          {isBooking && <p className="rounded-lg bg-sage-soft px-3 py-2 text-sm text-sage-ink">This stop shows a booking. Title and time are saved on the booking itself, so the booking tracker, Today and this itinerary stay in sync.</p>}
          {stop?.isFixed && <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn-ink">Fixed commitment — changing its time will ask for confirmation.</p>}
          <Field label="Title" htmlFor="s-title"><Input id="s-title" name="title" required defaultValue={stop?.title ?? ""} maxLength={160} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time" htmlFor="s-time"><Input id="s-time" name="startTime" type="time" defaultValue={stop?.startTime ?? ""} /></Field>
            <Field label="Duration (min)" htmlFor="s-dur"><Input id="s-dur" name="durationMin" type="number" min={0} max={1440} defaultValue={stop?.durationMin ?? ""} /></Field>
          </div>
          <Field label="Category" htmlFor="s-cat"><Select id="s-cat" name="category" defaultValue={stop?.category ?? "sight"}>{STOP_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select></Field>
          {!isBooking && (
            <>
              <Field label="Place name" htmlFor="s-loc"><Input id="s-loc" name="locationName" defaultValue={stop?.locationName ?? ""} /></Field>
              <Field label="Address" htmlFor="s-addr"><Input id="s-addr" name="address" defaultValue={stop?.address ?? ""} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Travel to next (min)" htmlFor="s-tr" hint="Your estimate"><Input id="s-tr" name="travelToNextMin" type="number" min={0} defaultValue={stop?.travelToNextMin ?? ""} /></Field>
                <Field label={`Est. cost (${currency})`} htmlFor="s-cost"><Input id="s-cost" name="estCost" inputMode="decimal" defaultValue={stop?.estCostMinor != null ? minorToDecimalString(stop.estCostMinor, currency) : ""} /></Field>
              </div>
              <Field label="Official link" htmlFor="s-url"><Input id="s-url" name="officialUrl" type="url" defaultValue={stop?.officialUrl ?? ""} placeholder="https://" /></Field>
              <Field label="Why go" htmlFor="s-reason"><Textarea id="s-reason" name="reason" defaultValue={stop?.reason ?? ""} /></Field>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="isMeal" defaultChecked={stop?.isMeal} className="h-5 w-5" /> Meal</label>
                <label className="flex min-h-11 items-center gap-2"><input type="checkbox" name="indoor" defaultChecked={stop?.indoor === true} className="h-5 w-5" /> Indoor</label>
              </div>
            </>
          )}
          <Field label="Notes" htmlFor="s-notes"><Textarea id="s-notes" name="notes" defaultValue={stop?.notes ?? ""} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : stop ? "Save" : "Add"}</Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

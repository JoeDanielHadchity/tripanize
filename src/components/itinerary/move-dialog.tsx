"use client";

import { useState } from "react";
import { Button, Field, Select } from "@/components/ui";
import { Dialog, useAction } from "@/components/client";
import { moveStopAction } from "@/app/actions/itinerary";
import { formatDate } from "@/lib/dates";
import { ImpactSummary } from "./impact";
import type { ImpactData, StopView } from "./types";

export function MoveDialog({ open, onClose, tripId, currency, stop, days }: { open: boolean; onClose: () => void; tripId: string; currency: string; stop: StopView | null; days: { id: string; date: string; title: string | null }[] }) {
  const { run, pending } = useAction();
  const [target, setTarget] = useState<string>("");
  const [plan, setPlan] = useState<"A" | "B">("A");
  const [impacts, setImpacts] = useState<{ label: string; impact: ImpactData }[] | null>(null);
  if (!stop) return null;
  const close = () => {
    setImpacts(null);
    setTarget("");
    onClose();
  };
  const dayId = target === "ideas" ? null : target;
  return (
    <Dialog open={open} onClose={close} title={`Move “${stop.title}”`}>
      {!impacts ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!target) return;
            const r = await run(() => moveStopAction(tripId, stop.id, dayId, plan, stop.version, false, true), { refresh: false });
            if (r) setImpacts(r.impacts);
          }}
        >
          <Field label="Move to" htmlFor="mv-target">
            <Select id="mv-target" required value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="" disabled>Choose…</option>
              {days.map((d) => (
                <option key={d.id} value={d.id} disabled={d.id === stop.dayId && plan === stop.plan}>
                  {formatDate(d.date)}{d.title ? ` — ${d.title}` : ""}
                </option>
              ))}
              {!stop.booking && <option value="ideas">Unscheduled ideas (no date)</option>}
            </Select>
          </Field>
          {target && target !== "ideas" && (
            <fieldset className="flex gap-2">
              <legend className="mb-1 text-sm font-medium">Plan</legend>
              {(["A", "B"] as const).map((p) => (
                <label key={p} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm">
                  <input type="radio" name="plan" checked={plan === p} onChange={() => setPlan(p)} /> Plan {p}
                </label>
              ))}
            </fieldset>
          )}
          {stop.booking && <p className="text-sm text-muted">Moving a booking changes its date in the booking tracker too (one record).</p>}
          <div className="flex justify-end gap-2">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!target || pending}>Review impact</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          {impacts.length === 0 && <p className="text-sm text-muted">No other stops are affected.</p>}
          {impacts.map((i) => <ImpactSummary key={i.label} label={i.label} impact={i.impact} currency={currency} />)}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setImpacts(null)}>Back</Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={async () => {
                const r = await run((confirmed) => moveStopAction(tripId, stop.id, dayId, plan, stop.version, confirmed, false), { success: dayId ? "Stop moved" : "Moved to unscheduled ideas" });
                if (r) close();
              }}
            >
              Move
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

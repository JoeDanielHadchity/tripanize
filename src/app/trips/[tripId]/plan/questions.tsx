"use client";
import { PremiumStar } from "@/components/premium-star";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onboardingAnswersAction } from "@/app/actions/onboarding";
import { Button, Card, Field, Notice, Spinner, Textarea, cx } from "@/components/ui";
import { useAction } from "@/components/client";
import { planQuestionsAction, savePlanPrefsAction } from "@/app/actions/itinerary";
import type { PlanPrefs, PlanQuestionSet } from "@/server/planner/questions";

// Multiple-choice pre-planning questions. Answers are saved on the trip and used by every later AI plan.
export function PlanQuestions({ tripId, canEdit, aiReady, prefs, onboarding = false }: { tripId: string; canEdit: boolean; aiReady: boolean; prefs: PlanPrefs | null; onboarding?: boolean }) {
  const { run, pending } = useAction();
  const router = useRouter();
  const [set, setSet] = useState<PlanQuestionSet | null>(null);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState(prefs?.note ?? "");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !set?.pendingJobId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await planQuestionsAction(tripId, false, true);
        if (stopped) return;
        if (!result.ok) throw new Error(result.error);
        setSet(result.data);
        setLoadError(null);
        if (result.data.pendingJobId) timer = setTimeout(poll, 2000);
        else setPicked({});
      } catch {
        if (!stopped) { setLoadError("Couldn't check the questions yet. Retrying…"); timer = setTimeout(poll, 5000); }
      }
    };
    timer = setTimeout(poll, 2000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [open, set?.pendingJobId, tripId]);

  async function load(refresh = false) {
    setOpen(true);
    const r = await run(() => planQuestionsAction(tripId, refresh), { refresh: false });
    if (!r) return;
    setSet(r);
    // Pre-fill from saved answers where the question text matches.
    const init: Record<string, string[]> = {};
    for (const q of r.questions) {
      const prev = prefs?.answers.find((a) => a.q === q.q);
      if (prev) init[q.id] = prev.a.filter((a) => q.options.includes(a));
    }
    setPicked(init);
  }

  useEffect(() => { if (onboarding) void load(); }, [onboarding, tripId]);

  function toggle(id: string, opt: string, multi: boolean) {
    setPicked((p) => {
      const cur = p[id] ?? [];
      return { ...p, [id]: multi ? (cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]) : cur.includes(opt) ? [] : [opt] };
    });
  }

  async function save() {
    if (!set) return;
    const answers = set.questions.map((q) => ({ q: q.q, a: picked[q.id] ?? [] })).filter((x) => x.a.length);
    if (onboarding) {
      const r = await run(() => onboardingAnswersAction(tripId, { answers, note: note || null }), { refresh: false });
      if (r) { router.push(`/trips/${tripId}/onboarding`); router.refresh(); }
      return;
    }
    const ok = await run(() => savePlanPrefsAction(tripId, { answers, note: note || null }), { success: "Preferences saved — the next plan will follow them" });
    if (ok !== null) setOpen(false);
  }

  if (!canEdit && !prefs) return null;

  if (!open) {
    return (
      <Card>
        <h2 className="font-display text-xl font-semibold">Your travel preferences</h2>
        {prefs ? (
          <>
            <ul className="mt-3 space-y-1 text-sm">
              {prefs.answers.map((a) => <li key={a.q}><span className="text-muted">{a.q}</span> — <strong>{a.a.join(", ")}</strong></li>)}
              {prefs.note && <li><span className="text-muted">Also:</span> {prefs.note}</li>}
            </ul>
            <p className="mt-2 text-xs text-muted">Used for every AI plan of this trip.</p>
            {canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => load()}>Edit answers</Button>
                <Button variant="ghost" disabled={pending} onClick={() => run(() => savePlanPrefsAction(tripId, null), { success: "Preferences cleared" })}>Clear</Button>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">Answer a few quick questions so the plan fits how you like to travel. About a minute.</p>
            <div className="mt-3"><Button variant="primary" onClick={() => load()}>{aiReady && <PremiumStar className="text-current" />}Answer questions</Button></div>
          </>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">A few questions first {aiReady && <PremiumStar />}</h2>
        {set && !set.pendingJobId && <span className="text-xs text-muted">{set.source === "ai" ? "Written by AI for this trip" : "Standard questions"}</span>}
      </div>
      {loadError && <Notice className="mt-3">{loadError}</Notice>}
      {!set || set.pendingJobId ? (
        <div className="mt-4 space-y-3"><p className="flex items-center gap-2 text-sm text-muted"><Spinner /> {aiReady ? "Writing questions for this trip…" : "Loading questions…"}</p><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></div>
      ) : (
        <div className="mt-4 space-y-5">
          {set.questions.map((q) => (
            <fieldset key={q.id}>
              <legend className="font-medium">{q.q}</legend>
              <p className="text-xs text-muted">{q.multi ? "Choose any" : "Choose one"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {q.options.map((o) => {
                  const on = (picked[q.id] ?? []).includes(o);
                  return (
                    <button key={o} type="button" aria-pressed={on} onClick={() => toggle(q.id, o, q.multi)} className={cx("min-h-11 rounded-full border px-4 text-sm", on ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:bg-surface-2")}>
                      {o}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <Field label="Anything else? (optional)" htmlFor="pq-note">
            <Textarea id="pq-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. one day trip to the coast, no early flights" />
          </Field>
          {Object.values(picked).every((a) => !a.length) && !note && <Notice tone="neutral">Pick at least one answer, or cancel to plan without preferences.</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending || (onboarding ? set.questions.some(q => !(picked[q.id]?.length)) : (Object.values(picked).every((a) => !a.length) && !note))} onClick={save}>{onboarding ? "Generate my trip" : "Save answers"}</Button>
            {!onboarding && <Button onClick={() => setOpen(false)}>Cancel</Button>}
            {aiReady && <Button variant="ghost" disabled={pending} onClick={() => { setSet(null); load(true); }}>New questions</Button>}
          </div>
        </div>
      )}
    </Card>
  );
}

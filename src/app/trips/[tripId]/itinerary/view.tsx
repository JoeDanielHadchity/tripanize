"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, EmptyState, Input, Notice, cx } from "@/components/ui";
import { Dialog, MenuButton, useAction, useConfirm } from "@/components/client";
import { StopCard } from "@/components/itinerary/stop-card";
import { StopEditor } from "@/components/itinerary/stop-editor";
import { MoveDialog } from "@/components/itinerary/move-dialog";
import { SwapDialog } from "@/components/itinerary/swap-dialog";
import { ImpactSummary } from "@/components/itinerary/impact";
import type { DayView, ImpactData, StopView } from "@/components/itinerary/types";
import { reorderAction, restoreVersionAction, setActivePlanAction, updateDayAction } from "@/app/actions/itinerary";
import { formatDate, formatDuration, formatTimestamp } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { MapsApp } from "@/lib/maps";

const TripMap = dynamic(() => import("@/components/itinerary/trip-map"), { ssr: false, loading: () => <p className="text-sm text-muted">Loading map…</p> });

type Props = {
  tripId: string; canEdit: boolean; currency: string; mapsApp: MapsApp; aiReady: boolean; routingLive: boolean; timezone: string;
  days: DayView[]; ideas: StopView[]; versions: { id: string; reason: string; createdAt: string }[]; weatherNote: string | null;
};

export function ItineraryView(p: Props) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ stop?: StopView | null; dayId?: string | null; plan?: "A" | "B"; label?: string } | null>(null);
  const [moving, setMoving] = useState<StopView | null>(null);
  const [swapping, setSwapping] = useState<StopView | null>(null);
  const [pendingOrder, setPendingOrder] = useState<{ day: DayView; ids: string[]; impact: ImpactData } | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [q, setQ] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [drag, setDrag] = useState<{ dayId: string; id: string } | null>(null);
  const [notesDay, setNotesDay] = useState<DayView | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(p.days[0]?.date ?? null);
  const selectedDay = p.days.find(d => d.date === selectedDate) ?? p.days[0];

  useEffect(() => {
    const syncDay = () => {
      const requested = window.location.hash.replace(/^#day-/, "");
      setSelectedDate(p.days.some(d => d.date === requested) ? requested : p.days[0]?.date ?? null);
    };
    syncDay();
    window.addEventListener("hashchange", syncDay);
    return () => window.removeEventListener("hashchange", syncDay);
  }, [p.days, p.tripId]);

  function selectDay(date: string) {
    setSelectedDate(date);
    setQ("");
    setView("list");
    setDrag(null);
    const hash = `#day-${date}`;
    if (window.location.hash !== hash) window.history.pushState(window.history.state, "", hash);
    requestAnimationFrame(() => document.getElementById(`day-${date}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }

  const handlers = { onEdit: (s: StopView) => setEditing({ stop: s }), onMove: (s: StopView) => setMoving(s), onSwap: (s: StopView) => setSwapping(s) };
  const query = q.trim().toLowerCase();
  const matches = (s: StopView) => !query || [s.title, s.address, s.locationName, s.category, s.notes].some((x) => x?.toLowerCase().includes(query));
  const results = useMemo(() => (query ? p.days.flatMap((d) => d.stops.filter(matches).map((s) => ({ d, s }))).concat(p.ideas.filter(matches).map((s) => ({ d: null as unknown as DayView, s }))) : []), [query, p.days, p.ideas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function reorder(day: DayView, ids: string[]) {
    const r = await run(() => reorderAction(p.tripId, day.id, day.activePlan, ids, true), { refresh: false });
    if (!r) return;
    if (r.impact.material) setPendingOrder({ day, ids, impact: r.impact });
    else await run(() => reorderAction(p.tripId, day.id, day.activePlan, ids, false), { success: "Order updated" });
  }

  if (!p.days.length && !p.ideas.length) {
    return (
      <EmptyState title="No days yet" action={<Link href={`/trips/${p.tripId}/settings#details`} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 font-medium text-on-accent">Add trip dates</Link>}>
        Set the trip dates to create a day for each date. You can still collect unscheduled ideas in the meantime.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="stop-search" className="sr-only">Search stops</label>
        <Input id="stop-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stops, addresses, categories…" className="sm:max-w-sm" />
        <div className="flex gap-1" role="group" aria-label="View">
          {(["list", "map"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cx("min-h-11 rounded-xl px-4 text-sm font-medium", view === v ? "bg-ink text-bg" : "border border-line bg-surface text-muted")}>
              {v === "list" ? "List" : "Map"}
            </button>
          ))}
        </div>
        <div className="flex gap-2 sm:ml-auto">
          {p.canEdit && <Button onClick={() => setEditing({ dayId: null })}>+ Idea</Button>}
          <Button onClick={() => setShowVersions(true)}>Versions{p.versions.length ? ` (${p.versions.length})` : ""}</Button>
        </div>
      </div>
      {p.weatherNote && <Notice tone="warn">{p.weatherNote}</Notice>}
      {!p.routingLive && <p className="text-xs text-muted">Travel times are estimates (no live routing service is connected). Use “Directions” for live routes in your maps app.</p>}

      {query ? (
        <section aria-label="Search results">
          <p className="mb-2 text-sm text-muted">{results.length} match{results.length === 1 ? "" : "es"}</p>
          <ul className="space-y-2">
            {results.map(({ d, s }) => (
              <li key={s.id} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <p className="font-medium">{s.title}</p>
                <p className="text-muted">{d ? `${formatDate(d.date)}${s.plan === "B" ? " · Plan B" : ""} · ${s.startTime ?? "no time"}` : "Unscheduled idea"}{s.address ? ` · ${s.address}` : ""}</p>
                {d && <a href={`#day-${d.date}`} onClick={e => { e.preventDefault(); selectDay(d.date); }} className="text-accent-ink underline">Go to day</a>}
              </li>
            ))}
          </ul>
        </section>
      ) : view === "map" ? (
        <TripMap days={p.days} ideas={p.ideas} />
      ) : (
        <>
        <DayStrip days={p.days} active={selectedDay?.date ?? null} onSelect={selectDay} />
        <ol aria-label="Selected itinerary day">
          {p.days.filter(d => d.id === selectedDay?.id).map((d) => {
            const stops = d.stops.filter((s) => s.plan === d.activePlan);
            const hasB = d.stops.some((s) => s.plan === "B");
            const cost = stops.filter((s) => s.status !== "SKIPPED").reduce((a, s) => a + (s.currency === p.currency || !s.currency ? s.estCostMinor ?? 0 : 0), 0);
            return (
              <li key={d.id} id={`day-${d.date}`} className="scroll-mt-28">
                <section aria-labelledby={`h-${d.id}`} className="rounded-3xl border border-line bg-surface-2/40 p-3 sm:p-5">
                  <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-accent-ink">{formatDate(d.date, { weekday: "long", day: "numeric", month: "long" })}</p>
                      <h3 id={`h-${d.id}`} className="font-display text-xl font-semibold leading-tight">{d.title || d.area || "Not planned yet"}</h3>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        {d.destination && <Badge>{d.destination.name}{d.destination.accommodationName ? ` · ${d.destination.accommodationName}` : ""}</Badge>}
                        {d.isTravelDay && <Badge tone="warn">Travel day{d.driveMinutes ? ` · ~${formatDuration(d.driveMinutes)} driving (est.)` : ""}</Badge>}
                        {d.weather && (
                          <Badge tone={d.weather.kind === "forecast" ? "sage" : "neutral"} title={d.weather.kind === "forecast" ? "Live forecast (Open-Meteo)" : "Typical conditions: 5-year average for this date — not a forecast"}>
                            {d.weather.kind === "forecast" ? "Forecast" : "Typical"}: {d.weather.summary}{d.weather.tMax !== null ? ` · ${Math.round(d.weather.tMax)}°/${Math.round(d.weather.tMin ?? 0)}°` : ""}{d.weather.precipProb !== null ? ` · ${d.weather.precipProb}% rain` : ""}
                          </Badge>
                        )}
                        {cost > 0 && <Badge>≈ {formatMoney(cost, p.currency)} planned (estimate)</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {(hasB || p.canEdit) && (
                        <div role="group" aria-label="Plan A or B" className="flex rounded-xl border border-line bg-surface p-0.5">
                          {(["A", "B"] as const).map((pl) => (
                            <button key={pl} type="button" aria-pressed={d.activePlan === pl} disabled={!p.canEdit || pending} onClick={() => run(() => setActivePlanAction(p.tripId, d.id, pl))} className={cx("min-h-10 rounded-lg px-3 text-sm font-medium", d.activePlan === pl ? "bg-accent text-on-accent" : "text-muted")}>
                              Plan {pl}
                            </button>
                          ))}
                        </div>
                      )}
                      <MenuButton label="Day options">
                        {(close) => (
                          <>
                            {p.canEdit && <button type="button" className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-surface-2" onClick={() => { close(); setEditing({ dayId: d.id, plan: d.activePlan, label: formatDate(d.date) }); }}>Add stop to Plan {d.activePlan}</button>}
                            {p.canEdit && <Link className="block min-h-11 content-center rounded-lg px-3 text-sm hover:bg-surface-2" href={`/trips/${p.tripId}/plan?days=${d.date}`}>Regenerate this day with AI</Link>}
                            {p.canEdit && <button type="button" className="block min-h-11 w-full rounded-lg px-3 text-left text-sm hover:bg-surface-2" onClick={() => { close(); setNotesDay(d); }}>Edit day title & notes</button>}
                            <a className="block min-h-11 content-center rounded-lg px-3 text-sm hover:bg-surface-2" href={`/api/trips/${p.tripId}/export/pdf?date=${d.date}`}>Day PDF</a>
                            <Link className="block min-h-11 content-center rounded-lg px-3 text-sm hover:bg-surface-2" href={`/trips/${p.tripId}/today?date=${d.date}`}>Open in Today view</Link>
                          </>
                        )}
                      </MenuButton>
                    </div>
                  </header>
                  {d.activePlan === "B" && <p className="mb-2 rounded-lg bg-sage-soft px-3 py-2 text-sm text-sage-ink">Showing Plan B{d.planBNote ? ` — ${d.planBNote}` : ""}. Plan B costs aren't added to the budget.</p>}
                  {d.notes && <p className="mb-3 whitespace-pre-line text-sm text-muted">{d.notes}</p>}
                  {stops.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                      {d.activePlan === "B" ? "No Plan B yet." : "Nothing planned — that's allowed."}
                      {p.canEdit && <Button className="ml-2" onClick={() => setEditing({ dayId: d.id, plan: d.activePlan, label: formatDate(d.date) })}>Add a stop</Button>}
                    </div>
                  ) : (
                    <ol className="space-y-2" aria-label={`Stops on ${formatDate(d.date)}`}>
                      {stops.map((s, i) => {
                        const ids = stops.map((x) => x.id);
                        const swap = (a: number, b: number) => {
                          const n = [...ids];
                          [n[a], n[b]] = [n[b], n[a]];
                          reorder(d, n);
                        };
                        return (
                          <StopCard
                            key={s.id}
                            s={s}
                            next={stops[i + 1]}
                            tripId={p.tripId}
                            currency={p.currency}
                            mapsApp={p.mapsApp}
                            canEdit={p.canEdit}
                            handlers={handlers}
                            reorder={p.canEdit ? {
                              up: i > 0 ? () => swap(i, i - 1) : undefined,
                              down: i < stops.length - 1 ? () => swap(i, i + 1) : undefined,
                              dragProps: {
                                draggable: true,
                                onDragStart: (e) => { setDrag({ dayId: d.id, id: s.id }); e.dataTransfer.effectAllowed = "move"; },
                                onDragOver: (e) => { if (drag?.dayId === d.id) e.preventDefault(); },
                                onDrop: (e) => {
                                  e.preventDefault();
                                  if (!drag || drag.dayId !== d.id || drag.id === s.id) return;
                                  const n = ids.filter((x) => x !== drag.id);
                                  n.splice(n.indexOf(s.id) + (ids.indexOf(drag.id) < i ? 1 : 0), 0, drag.id);
                                  setDrag(null);
                                  reorder(d, n);
                                },
                                onDragEnd: () => setDrag(null),
                              },
                            } : undefined}
                          />
                        );
                      })}
                    </ol>
                  )}
                  {d.questions.length > 0 && (
                    <div className="mt-3 rounded-xl bg-accent-soft/60 px-3 py-2 text-sm">
                      <p className="font-medium text-accent-ink">Open questions</p>
                      <ul className="list-disc pl-5">{d.questions.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                </section>
              </li>
            );
          })}
        </ol>
        </>
      )}

      {!query && view === "list" && (
        <section aria-labelledby="ideas-h" className="rounded-3xl border border-dashed border-line p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 id="ideas-h" className="font-display text-lg font-semibold">Unscheduled ideas</h2>
            {p.canEdit && <Button onClick={() => setEditing({ dayId: null })}>+ Add idea</Button>}
          </div>
          <p className="text-sm text-muted">Ideas without a date never appear in Today or the daily plan until you move them onto a day.</p>
          {p.ideas.length === 0 ? <p className="mt-3 text-sm text-muted">No ideas saved yet.</p> : (
            <ul className="mt-3 space-y-2">
              {p.ideas.map((s) => <StopCard key={s.id} s={s} tripId={p.tripId} currency={p.currency} mapsApp={p.mapsApp} canEdit={p.canEdit} handlers={{ onEdit: handlers.onEdit, onMove: handlers.onMove }} />)}
            </ul>
          )}
        </section>
      )}

      <StopEditor open={Boolean(editing)} onClose={() => setEditing(null)} tripId={p.tripId} currency={p.currency} stop={editing?.stop} dayId={editing?.dayId ?? null} plan={editing?.plan} dayLabel={editing?.label} />
      <MoveDialog open={Boolean(moving)} onClose={() => setMoving(null)} tripId={p.tripId} currency={p.currency} stop={moving} days={p.days.map((d) => ({ id: d.id, date: d.date, title: d.title }))} />
      <SwapDialog open={Boolean(swapping)} onClose={() => setSwapping(null)} tripId={p.tripId} currency={p.currency} stop={swapping} aiReady={p.aiReady} />
      <Dialog open={Boolean(pendingOrder)} onClose={() => setPendingOrder(null)} title="Review the new order">
        {pendingOrder && (
          <div className="space-y-4">
            <ImpactSummary impact={pendingOrder.impact} currency={p.currency} />
            <div className="flex justify-end gap-2">
              <Button onClick={() => setPendingOrder(null)}>Keep current order</Button>
              <Button variant="primary" disabled={pending} onClick={async () => { const o = pendingOrder; setPendingOrder(null); await run(() => reorderAction(p.tripId, o.day.id, o.day.activePlan, o.ids, false), { success: "Order updated" }); }}>Apply new order</Button>
            </div>
          </div>
        )}
      </Dialog>
      <Dialog open={Boolean(notesDay)} onClose={() => setNotesDay(null)} title={notesDay ? `Day notes — ${formatDate(notesDay.date)}` : ""}>
        {notesDay && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await run(() => updateDayAction(p.tripId, notesDay.id, { title: String(f.get("title")), notes: String(f.get("notes")), planBNote: String(f.get("planB")) }, notesDay.version), { success: "Day saved" });
            if (ok !== null) setNotesDay(null);
          }}>
            <label className="block text-sm font-medium" htmlFor="dn-title">Title</label>
            <Input id="dn-title" name="title" defaultValue={notesDay.title ?? ""} maxLength={120} />
            <label className="block text-sm font-medium" htmlFor="dn-notes">Notes</label>
            <textarea id="dn-notes" name="notes" rows={5} defaultValue={notesDay.notes ?? ""} className="w-full rounded-xl border border-line bg-surface px-3 py-2" />
            <label className="block text-sm font-medium" htmlFor="dn-b">Plan B note</label>
            <Input id="dn-b" name="planB" defaultValue={notesDay.planBNote ?? ""} placeholder="e.g. if it rains, swap to museums" />
            <div className="flex justify-end gap-2"><Button onClick={() => setNotesDay(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>Save</Button></div>
          </form>
        )}
      </Dialog>
      <Dialog open={showVersions} onClose={() => setShowVersions(false)} title="Itinerary versions">
        <p className="mb-3 text-sm text-muted">A version is saved automatically before every AI plan is applied and before a restore. Restoring replaces the current itinerary (bookings are never rolled back — they live in the booking tracker).</p>
        {p.versions.length === 0 ? <p className="text-sm">No saved versions yet.</p> : (
          <ul className="divide-y divide-line">
            {p.versions.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{v.reason}<span className="block text-xs text-muted">{formatTimestamp(v.createdAt, p.timezone)}</span></span>
                {p.canEdit && (
                  <Button disabled={pending} onClick={async () => {
                    if (await confirm({ title: "Restore this version?", message: "Your current itinerary will be replaced by this version. The current state is saved as a new version first, so you can undo.", confirmLabel: "Restore" })) {
                      await run(() => restoreVersionAction(p.tripId, v.id), { success: "Version restored" });
                      setShowVersions(false);
                    }
                  }}>Restore</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </div>
  );
}

// Day cards switch the visible day; horizontal scrolling keeps long trips compact.
function DayStrip({ days, active, onSelect }: { days: DayView[]; active: string | null; onSelect: (date: string) => void }) {
  const stripRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const item = document.getElementById(`strip-${active}`);
    if (!strip || !item) return;
    const row = strip.getBoundingClientRect();
    const card = item.getBoundingClientRect();
    const delta = card.left < row.left ? card.left - row.left : card.right > row.right ? card.right - row.right : 0;
    if (delta) strip.scrollBy({ left: delta, behavior: "smooth" });
  }, [active]);
  if (days.length < 2) return null;
  return (
    <nav aria-label="Days" className="sticky top-0 z-10 -mx-4 mb-4 bg-bg/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
      <ol ref={stripRef} className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {days.map((d, i) => {
          const n = d.stops.filter((s) => s.plan === d.activePlan && s.status !== "SKIPPED").length;
          const on = d.date === active;
          return (
            <li key={d.id} className="snap-start">
              <a id={`strip-${d.date}`} href={`#day-${d.date}`} aria-current={on ? "true" : undefined} onClick={e => { e.preventDefault(); onSelect(d.date); }}
                className={cx("block min-h-11 w-36 rounded-2xl border px-3 py-2.5 transition-colors", on ? "border-accent bg-accent text-on-accent shadow-sm" : "border-line bg-surface hover:bg-surface-2")}>
                <span className={cx("block text-[11px] font-semibold uppercase tracking-wider", on ? "opacity-90" : "text-muted")}>Day {i + 1}</span>
                <span className="block font-semibold">{formatDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                <span className={cx("block text-xs", on ? "opacity-90" : "text-muted")}>{n} stop{n === 1 ? "" : "s"}{d.isTravelDay ? " · travel" : ""}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

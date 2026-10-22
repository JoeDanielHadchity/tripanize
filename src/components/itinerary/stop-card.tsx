"use client";

import { Badge, ExternalLink, cx } from "@/components/ui";
import { MenuButton, useAction, useConfirm } from "@/components/client";
import { PlanningText } from "@/components/planning-text";
import { deleteStopAction, setStopStatusAction } from "@/app/actions/itinerary";
import { directionsUrl, type MapsApp } from "@/lib/maps";
import { formatDuration } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { StopView } from "./types";

export function StopBadges({ s }: { s: StopView }) {
  return (
    <>
      {s.booking ? (
        s.booking.status === "BOOKED" || s.booking.status === "PAID" ? <Badge tone="sage">✓ Booked{s.booking.status === "PAID" ? " · paid" : ""}</Badge> : <Badge tone="warn">Booking: {s.booking.status.toLowerCase().replace("_", " ")}</Badge>
      ) : s.isFixed ? (
        <Badge tone="sage">✓ Fixed commitment</Badge>
      ) : s.status === "SUGGESTED" ? (
        <Badge tone="accent" title="Suggested by AI — not booked or confirmed">Suggestion</Badge>
      ) : null}
      {s.status === "SKIPPED" && <Badge>Skipped</Badge>}
      {s.eventId && <Badge tone="accent">Event</Badge>}
      {s.isMeal && <Badge tone="sage">Meal</Badge>}
      {s.isFreeTime && <Badge tone="sage">Free time</Badge>}
      {s.bookingRequired && !s.booking && <Badge tone="warn">Booking needed</Badge>}
    </>
  );
}

function travelMode(m: string | null): "walking" | "driving" | "transit" {
  return m === "walking" || m === "cycling" ? "walking" : m === "driving" || m === "taxi" ? "driving" : "transit";
}

export type StopHandlers = { onEdit?: (s: StopView) => void; onMove?: (s: StopView) => void; onSwap?: (s: StopView) => void };

export function StopCard({ s, tripId, currency, mapsApp, canEdit, handlers, next, highlight, reorder, nextTravelMode }: {
  s: StopView; tripId: string; currency: string; mapsApp: MapsApp; canEdit: boolean; handlers: StopHandlers; next?: StopView | null; highlight?: "now" | "next" | null;
  reorder?: { up?: () => void; down?: () => void; dragProps?: React.HTMLAttributes<HTMLLIElement> & { draggable?: boolean } };
  nextTravelMode?: string | null;
}) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const dir = directionsUrl(s, mapsApp, travelMode(s.travelMode));
  const skipped = s.status === "SKIPPED";
  const actionCls = "block min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium hover:bg-surface-2 disabled:opacity-40";
  return (
    <li {...reorder?.dragProps} className={cx("group relative rounded-2xl border bg-surface p-3 sm:p-4", highlight === "now" ? "border-accent ring-2 ring-accent/30" : highlight === "next" ? "border-sage" : "border-line", skipped && "opacity-60")}>
      <div className="flex gap-3">
        <div className="w-14 shrink-0 pt-0.5 text-right">
          <p className="font-mono text-[15px] font-semibold">{s.startTime ?? "—"}</p>
          {s.durationMin ? <p className="text-xs text-muted">{formatDuration(s.durationMin)}</p> : null}
        </div>
        <div className="min-w-0 flex-1">
          {highlight && <p className="text-xs font-semibold uppercase tracking-wide text-accent-ink">{highlight === "now" ? "Now" : "Next"}</p>}
          <h4 className={cx("font-medium leading-snug", skipped && "line-through")}>{s.title}</h4>
          <div className="mt-1 flex flex-wrap gap-1"><StopBadges s={s} /></div>
          {(s.address || s.locationName) && <p className="mt-1 text-sm text-muted">{[s.locationName !== s.title ? s.locationName : null, s.address].filter(Boolean).join(", ")}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            {s.estCostMinor ? <span>≈ {formatMoney(s.estCostMinor, s.currency ?? currency)} {s.booking ? "" : "(estimate)"}</span> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {dir && <ExternalLink href={dir}>Directions</ExternalLink>}
            {s.officialUrl && <ExternalLink href={s.officialUrl}>{s.booking ? "Booking link" : "Official site"}</ExternalLink>}
            {s.booking && <a href={`/trips/${tripId}/bookings#b-${s.booking.id}`} className="text-accent-ink underline underline-offset-2">Booking details</a>}
          </div>
          {(s.reason || s.hoursNote || s.bookingNote || s.notes || s.travelNote) && <details className="mt-2 text-sm">
            <summary className="min-h-9 cursor-pointer content-center font-medium text-muted">Details & advice</summary>
            <div className="mt-1 space-y-2 whitespace-pre-line">
              {s.reason && <p><PlanningText text={s.reason} /></p>}
              {s.hoursNote && <p className="text-warn-ink"><PlanningText text={s.hoursNote} /></p>}
              {s.bookingNote && !s.booking && <p>Booking advice: <PlanningText text={s.bookingNote} /></p>}
              {s.notes && <p className="text-muted"><PlanningText text={s.notes} /></p>}
              {s.travelNote && <p className="text-muted"><PlanningText text={s.travelNote} /></p>}
            </div>
          </details>}
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2" role="group" aria-label={`Actions for ${s.title}`}>
              {handlers.onEdit && <button type="button" className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-2" onClick={() => handlers.onEdit!(s)}>Edit</button>}
              <MenuButton label="More">{close => <div onClick={close}>
              {!s.booking && !s.isFixed && (
                <button type="button" className={actionCls} disabled={pending} onClick={() => run(() => setStopStatusAction(tripId, s.id, skipped ? "PLANNED" : "SKIPPED", s.version), { success: skipped ? "Restored" : "Skipped" })}>
                  {skipped ? "Unskip" : "Skip"}
                </button>
              )}
              {handlers.onSwap && !s.booking && !s.isFixed && <button type="button" className={actionCls} onClick={() => handlers.onSwap!(s)}>Swap</button>}
              {handlers.onMove && <button type="button" className={actionCls} onClick={() => handlers.onMove!(s)}>Move</button>}
              {reorder?.up && <button type="button" className={actionCls} onClick={reorder.up} aria-label={`Move ${s.title} earlier`}>Move earlier ↑</button>}
              {reorder?.down && <button type="button" className={actionCls} onClick={reorder.down} aria-label={`Move ${s.title} later`}>Move later ↓</button>}
              {!s.booking && (
                <button type="button" className={cx(actionCls, "text-danger")} disabled={pending} onClick={async () => {
                    const ok = await confirm({ title: "Remove stop?", message: s.isFixed ? `“${s.title}” is a fixed commitment. Remove it from the plan?` : `Remove “${s.title}” from the plan?`, confirmLabel: "Remove", danger: true });
                    if (ok) run(() => deleteStopAction(tripId, s.id, true), { success: "Stop removed" });
                  }}>
                  Remove
                </button>
              )}
              </div>}</MenuButton>
            </div>
          )}
        </div>
        {reorder?.dragProps?.draggable && <span aria-hidden className="hidden cursor-grab select-none self-center px-1 text-muted sm:block" title="Drag to reorder">⋮⋮</span>}
      </div>
      {next && s.travelToNextMin ? (
        <p className="mt-2 pl-[4.25rem] text-xs text-muted">↓ ~{s.travelToNextMin} min {s.travelMode ?? nextTravelMode ?? ""} to {next.title} (estimate)</p>
      ) : null}
    </li>
  );
}

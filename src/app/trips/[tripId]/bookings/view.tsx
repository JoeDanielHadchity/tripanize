"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, ExternalLink, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";
import { Dialog, useAction, useConfirm } from "@/components/client";
import { deleteAttachmentAction, deleteBookingAction, saveBookingAction, setBookingStatusAction, uploadAttachmentAction } from "@/app/actions/bookings";
import { BOOKING_CATEGORIES, BOOKING_STATUSES } from "@/lib/constants";
import { CURRENCIES, formatMoney, minorToDecimalString } from "@/lib/money";
import { formatDate } from "@/lib/dates";

type Status = (typeof BOOKING_STATUSES)[number][0];
type B = {
  id: string; version: number; title: string; category: string; date: string | null; startTime: string | null; endDate: string | null; durationMin: number | null; guests: string | null; status: Status; priority: number;
  whenToBook: string | null; estCostMinor: number | null; finalCostMinor: number | null; currency: string; ticketType: string | null; preferences: string | null; address: string | null; bookingUrl: string | null;
  confirmationRef: string | null; notes: string | null; cancellationTerms: string | null; attachments: { id: string; fileName: string; sizeBytes: number; mimeType: string }[]; hasExpense: boolean; inItinerary: boolean; updatedAt: string;
};

const catLabel = Object.fromEntries(BOOKING_CATEGORIES) as Record<string, string>;
const statusLabel = Object.fromEntries(BOOKING_STATUSES) as Record<string, string>;
const statusTone = (s: string) => (s === "BOOKED" || s === "PAID" ? "sage" : s === "CANCELLED" ? "neutral" : s === "TO_BOOK" || s === "REQUESTED" ? "warn" : "accent") as "sage" | "neutral" | "warn" | "accent";

export function BookingsView({ tripId, canEdit, currency, bookings, tripDates }: { tripId: string; canEdit: boolean; currency: string; bookings: B[]; tripDates: { start: string | null; end: string | null } }) {
  const { run, pending } = useAction();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<B | "new" | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "confirmed" | "cancelled">("all");
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const anchors = bookings.filter((b) => (b.status === "IDEA" || b.status === "TO_BOOK") && (b.priority === 1 || b.category === "ACCOMMODATION" || ["FLIGHT", "TRAIN", "CAR_RENTAL"].includes(b.category)));
  const shown = bookings.filter((b) => filter === "all" ? b.status !== "CANCELLED" : filter === "open" ? ["IDEA", "TO_BOOK", "REQUESTED"].includes(b.status) : filter === "confirmed" ? ["BOOKED", "PAID"].includes(b.status) : b.status === "CANCELLED");

  return (
    <div className="space-y-6">
      <Notice tone="neutral">Roam records reservations — it doesn't book anything with providers. Book through the official link, then mark it <strong>Booked</strong> here so everyone sees it. Don't store card numbers; confirmation numbers are only shown in a booking's details.</Notice>

      {anchors.length > 0 && (
        <section aria-labelledby="anchors">
          <h2 id="anchors" className="font-display text-lg font-semibold">Book the anchors</h2>
          <p className="text-sm text-muted">Stays, long-distance transport and high-priority items that aren't booked yet.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {anchors.map((b) => (
              <li key={b.id} className="rounded-xl border border-line bg-surface p-3">
                <p className="font-medium">{b.title}</p>
                <p className="text-sm text-muted">{b.date ? formatDate(b.date) : "Date not selected"} · {catLabel[b.category]}{b.whenToBook ? ` · ${b.whenToBook}` : ""}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {b.bookingUrl && <a href={b.bookingUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-10 items-center rounded-lg border border-line px-3 text-sm">Open booking site</a>}
                  {canEdit && <Button className="min-h-10" disabled={pending} onClick={() => run(() => setBookingStatusAction(tripId, b.id, "BOOKED", b.version), { success: "Marked as booked" })}>I've booked it</Button>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="all-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="all-b" className="font-display text-lg font-semibold">All bookings</h2>
          {canEdit && <Button variant="primary" onClick={() => setEditing("new")}>+ Add booking</Button>}
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="group" aria-label="Filter bookings">
          {(["all", "open", "confirmed", "cancelled"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cx("min-h-11 rounded-xl px-4 text-sm font-medium", filter === f ? "bg-ink text-bg" : "border border-line bg-surface text-muted")}>
              {f === "all" ? "Active" : f === "open" ? "To do" : f === "confirmed" ? "Booked" : "Cancelled"}
            </button>
          ))}
        </div>
        {bookings.length === 0 ? (
          <div className="mt-4"><EmptyState title="No bookings yet" action={canEdit ? <Button variant="primary" onClick={() => setEditing("new")}>Add your first booking</Button> : undefined}>Track stays, transport, tickets and restaurant reservations — whether they're ideas or already paid.</EmptyState></div>
        ) : shown.length === 0 ? <p className="mt-4 text-sm text-muted">Nothing here.</p> : (
          <ul className="mt-4 space-y-2">
            {shown.map((b) => (
              <li key={b.id} id={`b-${b.id}`} className="scroll-mt-24">
                <Card className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{b.title}</p>
                      <p className="text-sm text-muted">{catLabel[b.category]} · {b.date ? `${formatDate(b.date)}${b.startTime ? ` ${b.startTime}` : ""}${b.endDate && b.endDate !== b.date ? ` – ${formatDate(b.endDate)}` : ""}` : "Date not selected"}{b.priority === 1 ? " · High priority" : ""}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={statusTone(b.status)}>{statusLabel[b.status]}</Badge>
                        {b.inItinerary ? <Badge>In itinerary</Badge> : b.date ? <Badge tone="warn" title="The date is outside the trip days">Not in a trip day</Badge> : <Badge>Unscheduled</Badge>}
                        {b.finalCostMinor !== null ? <Badge>{formatMoney(b.finalCostMinor, b.currency)} final</Badge> : b.estCostMinor !== null ? <Badge>≈ {formatMoney(b.estCostMinor, b.currency)} est.</Badge> : null}
                        {b.hasExpense && <Badge tone="sage">In expenses</Badge>}
                      </div>
                    </div>
                    {canEdit && (
                      <label className="flex items-center gap-2 text-sm">
                        <span className="sr-only">Status of {b.title}</span>
                        <Select className="min-h-10 w-auto" value={b.status} disabled={pending} onChange={(e) => run(() => setBookingStatusAction(tripId, b.id, e.target.value as Status, b.version), { success: "Status updated" })}>
                          {BOOKING_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </Select>
                      </label>
                    )}
                  </div>
                  <button type="button" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)} className="mt-2 min-h-10 text-sm text-accent-ink underline">{open === b.id ? "Hide details" : "Details"}</button>
                  {open === b.id && (
                    <div className="mt-2 space-y-2 border-t border-line pt-3 text-sm">
                      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                        {([["Guests", b.guests], ["Duration", b.durationMin ? `${b.durationMin} min` : null], ["When to book", b.whenToBook], ["Ticket / package", b.ticketType], ["Preferences", b.preferences], ["Address", b.address], ["Confirmation ref.", b.confirmationRef], ["Cancellation terms", b.cancellationTerms], ["Notes", b.notes]] as const).filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="whitespace-pre-line break-words">{v}</dd></div>
                        ))}
                      </dl>
                      {b.bookingUrl && <p><ExternalLink href={b.bookingUrl}>Official booking link</ExternalLink></p>}
                      <div>
                        <p className="font-medium">Tickets & files</p>
                        {b.attachments.length === 0 && <p className="text-muted">No files uploaded.</p>}
                        <ul className="space-y-1">
                          {b.attachments.map((a) => (
                            <li key={a.id} className="flex items-center gap-2">
                              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="text-accent-ink underline">{a.fileName}</a>
                              <span className="text-xs text-muted">{Math.ceil(a.sizeBytes / 1024)} KB</span>
                              {canEdit && <button type="button" className="min-h-10 px-2 text-xs text-danger" onClick={async () => { if (await confirm({ title: "Delete file?", message: `Delete ${a.fileName}?`, danger: true, confirmLabel: "Delete" })) run(() => deleteAttachmentAction(tripId, a.id), { success: "File deleted" }); }}>Delete</button>}
                            </li>
                          ))}
                        </ul>
                        {canEdit && (
                          <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const ok = await run(() => uploadAttachmentAction(tripId, b.id, fd), { success: "File uploaded" }); if (ok !== null) e.currentTarget?.reset(); }}>
                            <input ref={fileRef} name="file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="text-sm" aria-label={`Upload a ticket for ${b.title}`} required />
                            <Button type="submit" disabled={pending}>Upload</Button>
                            <span className="text-xs text-muted">PDF or image, up to 10 MB. Visible only to trip members.</span>
                          </form>
                        )}
                      </div>
                      {canEdit && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button onClick={() => setEditing(b)}>Edit</Button>
                          {(b.status === "PAID" || b.status === "BOOKED") && !b.hasExpense && <Link href={`/trips/${tripId}/expenses?fromBooking=${b.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-medium">Record payment as expense</Link>}
                          <Button variant="danger" onClick={async () => { if (await confirm({ title: "Delete booking?", message: `Delete “${b.title}”? It will also disappear from the itinerary. Linked expenses are kept.`, danger: true, confirmLabel: "Delete" })) run(() => deleteBookingAction(tripId, b.id), { success: "Booking deleted" }); }}>Delete</Button>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BookingDialog key={editing === "new" ? "new" : editing?.id ?? "none"} tripId={tripId} currency={currency} booking={editing} tripDates={tripDates} onClose={() => setEditing(null)} />
    </div>
  );
}

function BookingDialog({ tripId, currency, booking, onClose, tripDates }: { tripId: string; currency: string; booking: B | "new" | null; onClose: () => void; tripDates: { start: string | null; end: string | null } }) {
  const { run, pending } = useAction();
  const [error, setError] = useState<string | null>(null);
  const b = booking && booking !== "new" ? booking : null;
  const cur = b?.currency ?? currency;
  return (
    <Dialog open={Boolean(booking)} onClose={onClose} title={b ? `Edit “${b.title}”` : "Add a booking"} wide>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const s = (k: string) => String(f.get(k) ?? "").trim() || null;
          setError(null);
          const r = await run(() => saveBookingAction(tripId, b?.id ?? null, {
            title: s("title") ?? "", category: s("category") as never, status: s("status") as never, currency: s("currency") ?? currency, date: s("date"), startTime: s("startTime"), endDate: s("endDate"), durationMin: s("durationMin"), guests: s("guests"), priority: s("priority") ?? "2",
            whenToBook: s("whenToBook"), estCost: s("estCost"), finalCost: s("finalCost"), ticketType: s("ticketType"), preferences: s("preferences"), address: s("address"), bookingUrl: s("bookingUrl"), confirmationRef: s("confirmationRef"), notes: s("notes"), cancellationTerms: s("cancellationTerms"),
          }, b?.version ?? 0), { success: b ? "Booking saved" : "Booking added", onError: (r) => setError(r.error) });
          if (r) onClose();
        }}
      >
        <Field label="Title" htmlFor="b-title" className="sm:col-span-2"><Input id="b-title" name="title" required defaultValue={b?.title} maxLength={160} /></Field>
        <Field label="Category" htmlFor="b-cat"><Select id="b-cat" name="category" defaultValue={b?.category ?? "ATTRACTION"}>{BOOKING_CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Status" htmlFor="b-status"><Select id="b-status" name="status" defaultValue={b?.status ?? "IDEA"}>{BOOKING_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Date" htmlFor="b-date" hint="Leave empty for “date not selected” — it won't appear in a day."><Input id="b-date" name="date" type="date" defaultValue={b?.date ?? ""} min={tripDates.start ?? undefined} /></Field>
        <Field label="Time" htmlFor="b-time"><Input id="b-time" name="startTime" type="time" defaultValue={b?.startTime ?? ""} /></Field>
        <Field label="End date (stays, rentals)" htmlFor="b-end"><Input id="b-end" name="endDate" type="date" defaultValue={b?.endDate ?? ""} /></Field>
        <Field label="Duration (min)" htmlFor="b-dur"><Input id="b-dur" name="durationMin" type="number" min={0} defaultValue={b?.durationMin ?? ""} /></Field>
        <Field label="Travelers / guests" htmlFor="b-guests"><Input id="b-guests" name="guests" defaultValue={b?.guests ?? ""} /></Field>
        <Field label="Priority" htmlFor="b-pri"><Select id="b-pri" name="priority" defaultValue={String(b?.priority ?? 2)}><option value="1">High</option><option value="2">Normal</option><option value="3">Low</option></Select></Field>
        <Field label="When to book" htmlFor="b-when" className="sm:col-span-2"><Input id="b-when" name="whenToBook" defaultValue={b?.whenToBook ?? ""} placeholder="e.g. 2 weeks ahead; sells out on weekends" /></Field>
        <Field label="Currency" htmlFor="b-cur"><Select id="b-cur" name="currency" defaultValue={cur}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimated cost" htmlFor="b-est"><Input id="b-est" name="estCost" inputMode="decimal" defaultValue={b?.estCostMinor != null ? minorToDecimalString(b.estCostMinor, cur) : ""} /></Field>
          <Field label="Final cost" htmlFor="b-fin"><Input id="b-fin" name="finalCost" inputMode="decimal" defaultValue={b?.finalCostMinor != null ? minorToDecimalString(b.finalCostMinor, cur) : ""} /></Field>
        </div>
        <Field label="Ticket or package type" htmlFor="b-ticket"><Input id="b-ticket" name="ticketType" defaultValue={b?.ticketType ?? ""} /></Field>
        <Field label="Preferences" htmlFor="b-pref"><Input id="b-pref" name="preferences" defaultValue={b?.preferences ?? ""} placeholder="e.g. window seats, quiet room" /></Field>
        <Field label="Address" htmlFor="b-addr" className="sm:col-span-2"><Input id="b-addr" name="address" defaultValue={b?.address ?? ""} /></Field>
        <Field label="Official booking link" htmlFor="b-url" className="sm:col-span-2"><Input id="b-url" name="bookingUrl" type="url" defaultValue={b?.bookingUrl ?? ""} placeholder="https://" /></Field>
        <Field label="Confirmation reference" htmlFor="b-ref" hint="Visible to trip members in details only. Never enter card numbers."><Input id="b-ref" name="confirmationRef" defaultValue={b?.confirmationRef ?? ""} autoComplete="off" /></Field>
        <Field label="Cancellation terms" htmlFor="b-cancel"><Input id="b-cancel" name="cancellationTerms" defaultValue={b?.cancellationTerms ?? ""} /></Field>
        <Field label="Notes" htmlFor="b-notes" className="sm:col-span-2"><Textarea id="b-notes" name="notes" defaultValue={b?.notes ?? ""} /></Field>
        {error && <Notice tone="danger" className="sm:col-span-2">{error}</Notice>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save booking"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

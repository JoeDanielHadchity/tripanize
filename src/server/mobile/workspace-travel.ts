import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { listBookings } from "@/server/bookings/service";
import { listEvents } from "@/server/events/service";
import { getPacking } from "@/server/packing/service";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { BOOKING_CATEGORIES, BOOKING_STATUSES, NOTIFY_CHANGE_TYPES, PACKING_CATEGORIES } from "@/lib/constants";
import { f, act, go, form, options, link, wire } from "./presentation";
import type { MobileBlock, MobileValue } from "@/lib/mobile-workspace";

export async function travelBlocks(userId: string, tripId: string, screen: string, query: URLSearchParams, canEdit: boolean, premium: boolean): Promise<MobileBlock[]> {
  const item = query.get("item");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  if (screen === "packing") {
    const { personal, shared } = await getPacking(userId, tripId);
    const tasks = await prisma.tripTask.findMany({ where: { tripId }, orderBy: [{ done: "asc" }, { position: "asc" }] });
    const travelers = await prisma.traveler.findMany({ where: { tripId, leftAt: null }, select: { id: true, name: true } });
    const blocks: MobileBlock[] = [{ id: "privacy", text: "Your personal list is private. Shared items and preparation tasks are visible to the group." }];
    if (premium) blocks.push(form("suggest", "★ Personalized packing", "packing.generate", [f("laundry", "Laundry available during the trip", "check", { value: false })], {}, "Refresh suggestions"));
    blocks.push(form("add", "Add a packing item", "packing.add", [f("label", "Item", "text", { required: true }), f("category", "Category", "select", { options: options(PACKING_CATEGORIES), value: "Misc" }), f("quantity", "Quantity", "number", { value: 1 }), ...(canEdit ? [f("shared", "Shared with the group", "check", { value: false })] : [])], { shared: false }, "Add item"));
    for (const [label, items] of [["Personal", personal], ["Shared", shared]] as const) {
      blocks.push({ id: `heading-${label}`, title: `${label} · ${items.filter(i => i.packed).length}/${items.length} packed` });
      for (const i of items) {
        const editable = label === "Personal" || canEdit;
        blocks.push({ id: i.id, title: `${i.packed ? "✓ " : ""}${i.label}`, meta: `${i.category} · ×${i.quantity}`, text: i.reason ?? undefined, actions: editable ? [act(i.packed ? "Unpack" : "Mark packed", "packing.update", { id: i.id, version: i.version, packed: !i.packed }), act("Remove", "packing.remove", { id: i.id }, "Remove this packing item?")] : [] });
        if (editable && item === i.id) blocks.push(form("edit-item", "Edit item", "packing.update", [f("label", "Label"), f("category", "Category", "select", { options: options(PACKING_CATEGORIES) }), f("quantity", "Quantity", "number")], { id: i.id, version: i.version, label: i.label, category: i.category, quantity: i.quantity }));
        else if (editable) blocks.at(-1)!.actions!.push(go("Edit item", "packing", tripId, i.id));
      }
    }
    blocks.push({ id: "tasks-heading", title: "Preparation tasks" });
    for (const t of tasks) blocks.push({ id: t.id, title: `${t.done ? "✓ " : ""}${t.title}`, meta: [t.dueDate, travelers.find(p => p.id === t.assigneeId)?.name].filter(Boolean).join(" · "), actions: canEdit ? [act(t.done ? "Reopen" : "Complete", "task.toggle", { id: t.id, version: t.version, done: !t.done }), act("Remove task", "task.delete", { id: t.id }, "Remove this shared task?")] : [] });
    if (canEdit) blocks.push(form("task", "Add a preparation task", "task.add", [f("title", "Task", "text", { required: true }), f("dueDate", "Due date", "date"), f("assigneeId", "Assigned to", "select", { options: [{ value: "", label: "Anyone" }, ...travelers.map(t => ({ value: t.id, label: t.name }))] })], {}, "Add task"));
    return blocks;
  }
  const header: MobileBlock = { id: "sections", actions: [go("Bookings", "bookings", tripId), go("★ Events", "events", tripId)] };
  if (screen === "bookings" || screen === "booking") {
    const data = await listBookings(userId, tripId);
    if (screen === "booking") {
      if (!canEdit) throw new AppError("FORBIDDEN", "Only the organizer and editors can change bookings.");
      const b = data.bookings.find(b => b.id === item);
      const e = !b && item && premium ? await prisma.tripEvent.findFirst({ where: { id: item, tripId, status: { not: "HIDDEN" }, booking: null } }) : null;
      if (item && !b && !e) throw new AppError("NOT_FOUND", "Booking or event not found.");
      const fields = [f("title", "Title", "text", { required: true }), f("category", "Category", "select", { options: BOOKING_CATEGORIES.map(([value, label]) => ({ value, label })) }), f("status", "Status", "select", { options: BOOKING_STATUSES.map(([value, label]) => ({ value, label })) }), f("date", "Date", "date"), f("startTime", "Start time", "time"), f("endDate", "End date", "date"), f("durationMin", "Duration (minutes)", "number"), f("guests", "Guests"), f("priority", "Priority (1–3)", "number"), f("currency", "Currency"), f("estCost", "Estimated group cost", "money"), f("finalCost", "Final group cost", "money"), f("bookingUrl", "Booking link"), f("confirmationRef", "Confirmation reference"), f("address", "Address"), f("ticketType", "Ticket type"), f("whenToBook", "When to book"), f("bookByAt", "Book by", "text", { hint: "YYYY-MM-DDTHH:MM, destination local time" }), f("paymentDueAt", "Payment due", "text", { hint: "YYYY-MM-DDTHH:MM" }), f("freeCancellationAt", "Free cancellation until", "text", { hint: "YYYY-MM-DDTHH:MM" }), f("preferences", "Preferences", "long"), f("cancellationTerms", "Cancellation terms", "long"), f("notes", "Notes", "long")];
      const values: import("@/lib/mobile-workspace").MobileValues = b ? { ...wire(b) as Record<string, MobileValue>, estCost: b.estCostMinor === null ? "" : minorToDecimalString(b.estCostMinor, b.currency), finalCost: b.finalCostMinor === null ? "" : minorToDecimalString(b.finalCostMinor, b.currency) } : { title: e?.title ?? "", eventId: e?.id ?? null, category: "EXPERIENCE", status: "TO_BOOK", currency: trip.currency, priority: 2, date: e?.date ?? null, startTime: e?.startTime ?? null, bookingUrl: e?.bookingUrl ?? e?.officialUrl ?? "", address: e?.address ?? null };
      const blocks = [header, form("booking", b ? "Edit booking" : "Add a booking", "booking.save", fields, values)];
      if (b) {
        blocks.push({ id: "delete", actions: [act("Delete booking", "booking.delete", { id: b.id }, "Remove this booking? This does not cancel any reservation with the provider.")] });
        blocks.push({ ...form("files", "Booking documents", "booking.upload", [f("files", "Attach an image or PDF", "files")], { id: b.id }, "Attach documents"), form: { action: "booking.upload", fields: [f("files", "Attach an image or PDF", "files")], values: { id: b.id }, label: "Attach documents", upload: "booking" } });
        for (const a of b.attachments) blocks.push({ id: a.id, title: a.fileName, actions: [{ label: "Open document", device: "file", url: `/api/mobile/files?attachmentId=${encodeURIComponent(a.id)}`, fileName: a.fileName }, act("Remove document", "attachment.delete", { id: a.id }, "Remove this document?")] });
      } return blocks;
    }
    const blocks: MobileBlock[] = [header, ...(canEdit ? [{ id: "add-booking", actions: [go("Add a booking", "booking", tripId)] }] : [])];
    for (const b of data.bookings) blocks.push({ id: b.id, title: b.title, meta: [b.status.replace(/_/g, " "), b.date, b.startTime, b.finalCostMinor !== null ? formatMoney(b.finalCostMinor, b.currency) : b.estCostMinor !== null ? `Est. ${formatMoney(b.estCostMinor, b.currency)}` : null].filter(Boolean).join(" · "), text: b.notes ?? undefined, lines: [b.address, b.confirmationRef ? `Reference: ${b.confirmationRef}` : null, b.bookByAt ? `Book by: ${b.bookByAt}` : null, b.freeCancellationAt ? `Free cancellation: ${b.freeCancellationAt}` : null].filter((s): s is string => Boolean(s)), actions: [...link("Provider website", b.bookingUrl), ...(canEdit ? [go("Edit / documents", "booking", tripId, b.id)] : []), ...(canEdit && premium && !b.expenses.length ? [go("Record payment", "expense", tripId, `booking:${b.id}`)] : []), ...(!canEdit ? b.attachments.map(a => ({ label: a.fileName, device: "file" as const, url: `/api/mobile/files?attachmentId=${encodeURIComponent(a.id)}`, fileName: a.fileName })) : [])] });
    if (data.suggestedEvents.length) blocks.push({ id: "suggested", title: "Suggested event bookings", text: "Suggestions are linked to their events. Hiding an event removes its unconfirmed booking suggestion." });
    for (const e of data.suggestedEvents) blocks.push({ id: e.id, title: e.title, meta: [e.date, e.venue, e.priceText].filter(Boolean).join(" · "), actions: [...link("Event / tickets", e.bookingUrl ?? e.officialUrl), ...(canEdit ? [go("Track this booking", "booking", tripId, e.id)] : [])] });
    if (!data.bookings.length) blocks.push({ id: "empty", text: "Your manual bookings and event booking suggestions will appear here." });
    return blocks;
  }
  if (screen === "event") {
    if (!canEdit) throw new AppError("FORBIDDEN", "Only the organizer and editors can add events.");
    return [header, form("custom-event", "Add your own event", "event.add", [f("title", "Title", "text", { required: true }), f("date", "Date", "date"), f("startTime", "Start time", "time"), f("category", "Category"), f("venue", "Venue"), f("city", "City"), f("officialUrl", "Official website"), f("bookingUrl", "Booking link"), f("priceText", "Price information"), f("notes", "Notes", "long")], {}, "Add event")];
  }
  const data = await listEvents(userId, tripId);
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" }, select: { id: true, date: true } });
  const pref = await prisma.notificationPreference.findUnique({ where: { userId_tripId: { userId, tripId } } });
  const blocks: MobileBlock[] = [header, { id: "cadence", title: data.settings.cadence, text: data.settings.nextDiscoveryAt ? `Next search: ${data.settings.nextDiscoveryAt.toISOString()}` : "Automatic search is off.", actions: canEdit ? [act("Find events now", "events.discover"), go("Add your own event", "event", tripId)] : [] }];
  for (const e of data.events) {
    if (e.status === "HIDDEN" && item !== "hidden") continue;
    blocks.push({ id: e.id, title: e.title, meta: [e.date, e.startTime, e.venue, e.status, e.cancelled ? "Cancelled" : "", e.soldOut ? "Sold out" : ""].filter(Boolean).join(" · "), text: e.whyFits ?? undefined, lines: [e.priceText, e.uncertainty, e.availability].filter((s): s is string => Boolean(s)), actions: [
      ...link("Official website", e.officialUrl), ...link("Tickets", e.bookingUrl), ...e.sources.flatMap(s => link(s.title ?? "Source", s.url)),
      ...(canEdit ? [act(e.status === "HIDDEN" ? "Restore event" : "Hide event", "event.status", { id: e.id, status: e.status === "HIDDEN" ? e.hiddenStop ? "SCHEDULED" : "SAVED" : "HIDDEN", expectedStatus: e.status }, e.status === "HIDDEN" ? undefined : "Hide this event and remove its unconfirmed booking suggestion? You can undo this from Hidden events."), ...(e.status === "NEW" ? [act("Save event", "event.status", { id: e.id, status: "SAVED", expectedStatus: e.status })] : []), ...(!e.booking && e.status !== "HIDDEN" ? [go("Track booking", "booking", tripId, e.id)] : [])] : []),
    ] });
    if (canEdit && e.status !== "HIDDEN" && !e.cancelled) blocks.push(form(`schedule-${e.id}`, `Add ${e.title} to your itinerary`, "event.schedule", [f("dayId", "Day", "select", { options: days.map(d => ({ value: d.id, label: d.date })) }), f("startTime", "Start time", "time", { value: e.startTime }), f("durationMin", "Duration (minutes)", "number", { value: 90 })], { id: e.id }, "Schedule event"));
  }
  blocks.push({ id: "hidden", actions: [go(item === "hidden" ? "Hide removed events" : "Hidden events & undo", "events", tripId, item === "hidden" ? undefined : "hidden")] });
  if (canEdit) blocks.push(form("discovery-settings", "Automatic event searches", "events.settings", [f("autoDiscovery", "Search automatically", "check")], { autoDiscovery: data.settings.autoDiscovery }));
  blocks.push(form("event-alerts", "Your event alerts", "events.alerts", [f("emailEnabled", "Email matching events", "check"), f("frequency", "Email frequency", "select", { options: options(["immediate", "daily"]) }), f("changeTypes", "Notify me about", "multi", { options: NOTIFY_CHANGE_TYPES.map(([value, label]) => ({ value, label })) })], { emailEnabled: pref?.emailEnabled ?? false, frequency: pref?.frequency ?? "immediate", changeTypes: wire(pref?.changeTypes ?? ["new", "date", "venue", "cancelled", "sold_out"]) }));
  for (const r of data.runs) blocks.push({ id: r.id, title: `Search ${r.status}`, meta: (r.finishedAt ?? r.createdAt).toISOString(), text: r.error ?? `${r.added} new · ${r.changed} updated` });
  return blocks;
}

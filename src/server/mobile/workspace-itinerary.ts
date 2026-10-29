import { savedTripImage } from "@/server/images";
import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getItinerary, effectiveStop, listVersions } from "@/server/itinerary/service";
import { getTripPlan } from "@/server/plans/access";
import { getJob, latestJobs } from "@/server/planner/jobs";
import { getPlanQuestions } from "@/server/planner/questions";
import { getAssistantConversation } from "@/server/assistant/service";
import { readMealOptions } from "@/lib/meal-options";
import { todayIn } from "@/lib/dates";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { STOP_CATEGORIES } from "@/lib/constants";
import { ProposalSchema, SwapSchema } from "@/server/planner/schema";
import { f, act, go, form, options, link, wire } from "./presentation";
import type { MobileBlock } from "@/lib/mobile-workspace";

export async function itineraryBlocks(userId: string, tripId: string, screen: string, query: URLSearchParams, canEdit: boolean): Promise<{ blocks: MobileBlock[]; pollMs?: number }> {
  const item = query.get("item");
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  const premium = (await getTripPlan(tripId)).premium;
  if (screen === "versions") {
    const versions = await listVersions(userId, tripId);
    return { blocks: versions.length ? versions.map(v => ({ id: v.id, title: v.reason, meta: v.createdAt.toISOString(), actions: canEdit ? [act("Restore this version", "version.restore", { id: v.id }, "Restore this itinerary? A backup of the current itinerary will be kept.")] : [] })) : [{ id: "empty", text: "Itinerary backups will appear here after planning changes." }] };
  }
  if (screen === "assistant") {
    const chat = await getAssistantConversation(userId, tripId);
    return { pollMs: chat.turns.some(t => ["QUEUED", "RUNNING"].includes(t.status)) ? 3000 : undefined, blocks: [
      { id: "intro", text: "Ask about your trip or propose a change. Review changes before applying them." },
      ...chat.turns.map(t => ({ id: t.id, title: t.question, text: t.reply ?? t.error ?? "Thinking…", meta: t.appliedAt ? "Applied" : t.status, lines: t.preview ? [...t.preview.changes, ...t.preview.warnings, ...t.preview.conflicts, ...t.preview.days.flatMap(d => [`${d.date}: ${d.beforeTitle ?? ""} → ${d.afterTitle ?? ""}`, `Before: ${d.before.map(s => `${s.time ?? "Anytime"} ${s.title}`).join(" · ")}`, `After: ${d.after.map(s => `${s.time ?? "Anytime"} ${s.title}`).join(" · ")}`])] : [], actions: [
        ...t.sources.flatMap(url => link("Source", url)),
        ...(chat.canEdit && t.preview && !t.appliedAt && !t.dismissed && t.status === "SUCCEEDED" ? [act("Apply reviewed changes", "assistant", { op: "apply", id: t.id }, "Apply these changes to the shared itinerary? You can restore the previous version from itinerary history."), act("Dismiss", "assistant", { op: "dismiss", id: t.id })] : []),
        ...(["QUEUED", "RUNNING"].includes(t.status) ? [act("Cancel reply", "assistant", { op: "cancel", id: t.id })] : []),
      ] })),
      form("ask", "Trip assistant", "assistant", [f("message", "Your message", "long", { required: true })], { op: "send", selectedDate: query.get("day"), clientId: crypto.randomUUID() }, "Send"),
    ] };
  }
  if (screen === "job") {
    if (!item) throw new AppError("NOT_FOUND", "Choose an itinerary draft.");
    const job = await getJob(userId, tripId, item);
    const blocks: MobileBlock[] = [{ id: "progress", title: job.status.replace(/_/g, " "), text: job.error ?? undefined, lines: Array.isArray(job.progress) ? job.progress.flatMap(p => p && typeof p === "object" && "message" in p && typeof p.message === "string" ? [p.message] : []) : [], actions: canEdit && ["QUEUED", "RUNNING"].includes(job.status) ? [act("Cancel generation", "plan.cancel", { id: job.id })] : [] }];
    if (job.kind === "swap" && job.status === "SUCCEEDED") {
      const parsed = SwapSchema.safeParse(job.proposal);
      const stopId = job.params && typeof job.params === "object" && !Array.isArray(job.params) && typeof job.params.stopId === "string" ? job.params.stopId : "";
      const sourceStop = await prisma.stop.findFirst({ where: { id: stopId, tripId }, select: { version: true } });
      if (parsed.success) for (const [index, s] of parsed.data.alternatives.entries()) blocks.push({ id: `swap-${index}`, title: s.title, text: s.reason, meta: `${s.startTime} · ${s.durationMin} minutes`, actions: [...link("Official website", s.officialUrl), ...(canEdit ? [act("Choose this alternative", "plan.swap", { id: job.id, index, version: sourceStop?.version ?? 0 }, "Replace the original stop with this alternative?")] : [])] });
    } else if (job.status === "SUCCEEDED") {
      const proposal = ProposalSchema.safeParse(job.proposal);
      if (proposal.success) {
        blocks.push({ id: "summary", title: "Review your draft", text: proposal.data.summary, lines: proposal.data.generalNotes });
        for (const d of proposal.data.days) blocks.push({ id: d.date, title: `${d.date} · ${d.title}`, text: d.area, lines: [...d.stops.map(s => `${s.startTime} · ${s.title} · ${s.durationMin} min${s.bookingRequired ? " · Booking needed" : ""}`), ...d.notes, ...d.questions] });
        if (canEdit && !job.appliedAt) blocks.push(form("apply", "Apply your draft", "plan.apply", [f("dates", "Days to replace", "multi", { options: proposal.data.days.map(d => ({ value: d.date, label: `${d.date} · ${d.title}` })), value: proposal.data.days.map(d => d.date) })], { id: job.id }, "Apply selected days"));
      }
    }
    return { blocks, ...(["QUEUED", "RUNNING"].includes(job.status) ? { pollMs: 3000 } : {}) };
  }
  const { days, ideas } = await getItinerary(userId, tripId);
  const day = days.find(d => d.id === (query.get("day") ?? item)) ?? days.find(d => d.date === todayIn(trip.timezone)) ?? days[0];
  if (screen === "plan") {
    const questions = await getPlanQuestions(userId, tripId, { cachedOnly: true });
    const saved = trip.planPrefs && typeof trip.planPrefs === "object" && !Array.isArray(trip.planPrefs) ? trip.planPrefs : {};
    const blocks: MobileBlock[] = [{ id: "scope", title: premium ? "★ Plan every day" : "First 2 AI days included", text: "AI changes are saved as a draft for review. Your manual itinerary stays editable on every day." },
      ...(canEdit ? [form("prefs", "Planning & food preferences", "plan.preferences", [...questions.questions.map((q, i) => f(`answers.${i}.a`, q.q, "multi", { options: options(q.options), max: q.multi ? undefined : 1 })), f("note", "Travel preferences", "long"), f("foodNotes", "Food preferences & allergies", "long")], { answers: questions.questions.map(q => { const old = Array.isArray(saved.answers) ? saved.answers.find(a => a && typeof a === "object" && !Array.isArray(a) && a.q === q.q) : null; return { q: q.q, a: old && typeof old === "object" && !Array.isArray(old) && Array.isArray(old.a) ? wire(old.a) : [] }; }), note: typeof saved.note === "string" ? saved.note : "", foodNotes: typeof saved.foodNotes === "string" ? saved.foodNotes : "" }),
      form("generate", "Create an itinerary draft", "plan.start", [f("instruction", "Anything to focus on?", "long")], { kind: "full" }, "Generate itinerary"),
      ...(premium ? [form("regenerate", "Regenerate selected days", "plan.start", [f("dates", "Choose days", "multi", { options: days.map(d => ({ value: d.date, label: d.date })) }), f("instruction", "Instructions", "long")], { kind: "days" }, "Prepare alternatives")] : []),
      ] : []),
      ...(await latestJobs(userId, tripId)).map(j => ({ id: j.id, title: `${j.kind === "full" ? "Trip" : "Selected days"} · ${j.status}`, meta: j.createdAt.toISOString(), actions: [go("View draft", "job", tripId, j.id)] })),
    ]; return { blocks };
  }
  if (screen === "stop") {
    if (!canEdit) throw new AppError("FORBIDDEN", "Only the organizer and editors can edit the itinerary.");
    const stop = item ? [...days.flatMap(d => d.stops), ...ideas].find(s => s.id === item) : null;
    if (item && !stop) throw new AppError("NOT_FOUND", "Stop not found.");
    const fields = [f("title", "Title", "text", { required: true }), f("category", "Category", "select", { options: options(STOP_CATEGORIES), value: "sight" }), f("dayId", "Day", "select", { options: [{ value: "", label: "Unscheduled idea" }, ...days.map(d => ({ value: d.id, label: d.date }))] }), f("plan", "Plan", "select", { options: options(["A", "B"]), value: "A" }), f("startTime", "Start time", "time"), f("durationMin", "Duration (minutes)", "number"), f("address", "Address"), f("locationName", "Place name"), f("officialUrl", "Official link"), f("estCost", `Estimated group cost (${trip.currency})`, "money"), f("reason", "Why this fits", "long"), f("travelToNextMin", "Travel to next stop (minutes)", "number"), f("travelMode", "Travel mode"), f("bookingRequired", "Booking needed", "check"), f("bookingNote", "Booking advice", "long"), f("hoursNote", "Opening hours", "long"), f("notes", "Notes", "long"), f("isMeal", "Meal", "check"), f("isFreeTime", "Free time", "check"), f("confirm", "Confirm changes to fixed or booked items", "check")];
    // Editing a booked stop delegates its canonical schedule to the booking form.
    if (stop?.bookingId) return { blocks: [{ id: "booking", text: "This stop comes from a booking. Update the booking to keep both sections in sync.", actions: [go("Edit booking", "booking", tripId, stop.bookingId)] }] };
    const editForm = form("stop", stop ? "Edit stop" : "Add a stop", "stop.save", stop ? fields.filter(f => !["dayId", "plan"].includes(f.key)) : fields, stop ? { ...wire(stop) as Record<string, import("@/lib/mobile-workspace").MobileValue>, estCost: stop.estCostMinor === null ? "" : minorToDecimalString(stop.estCostMinor, stop.currency ?? trip.currency), confirm: false } : { dayId: query.get("day") ?? day?.id ?? null, plan: "A", title: "", category: "sight" });
    return { blocks: [editForm, ...(stop ? [form("move", "Move to another day", "stop.move", [f("dayId", "Move to", "select", { options: [{ value: "", label: "Unscheduled idea" }, ...days.map(d => ({ value: d.id, label: d.date }))] }), f("plan", "Plan", "select", { options: options(["A", "B"]) }), f("confirm", "Confirm any impact on fixed times", "check")], { id: stop.id, version: stop.version, dayId: stop.dayId, plan: stop.plan, confirm: false }, "Move stop"), { id: "tools", actions: [act(stop.status === "SKIPPED" ? "Restore stop" : "Skip stop", "stop.status", { id: stop.id, version: stop.version, status: stop.status === "SKIPPED" ? "PLANNED" : "SKIPPED" }), ...(premium && !stop.isFixed ? [act("Suggest alternatives", "plan.start", { kind: "swap", stopId: stop.id })] : []), act("Delete stop", "stop.delete", { id: stop.id, confirm: true }, "Remove this stop from the shared itinerary? Linked suggested bookings will also be updated.")] }] : [])] };
  }
  if (screen === "day") {
    if (!day) throw new AppError("NOT_FOUND", "Day not found.");
    return { blocks: [form("day", day.date, "day.save", [f("title", "Day title"), f("notes", "Notes", "long"), f("planBNote", "Plan B notes", "long")], { id: day.id, version: day.version, title: day.title, notes: day.notes, planBNote: day.planBNote })] };
  }
  const destination = await prisma.destination.findFirst({ where: { tripId }, orderBy: { position: "asc" } });
  const cover = savedTripImage(trip, destination ?? undefined);
  const blocks: MobileBlock[] = [...(cover ? [{ id: "cover", image: { url: cover.url, credit: cover.credit } }] : []), { id: "tools", title: trip.name, meta: premium ? "★ Premium" : "Standard", actions: [go("Plan with AI", "plan", tripId), ...(premium ? [go("Trip assistant", "assistant", tripId)] : []), go("Group voting", "votes", tripId), go("History & undo", "versions", tripId), { label: "Save itinerary offline", device: "offline" }, { label: "Download trip PDF", device: "file", url: `/api/mobile/files?tripId=${encodeURIComponent(tripId)}&kind=pdf`, fileName: "Tripanize-trip.pdf" }] },
    { id: "days", actions: days.map((d, i) => go(`Day ${i + 1} · ${d.date.slice(5)}`, "itinerary", tripId, d.id)) },
  ];
  if (!day) { blocks.push({ id: "dates", text: "Add your trip dates to start planning each day.", actions: [go("Trip settings", "settings", tripId)] }); return { blocks }; }
  blocks.push({ id: "day", title: `${day.date} · ${day.title ?? day.destination?.name ?? "Your day"}`, text: day.notes ?? undefined, meta: `Plan ${day.activePlan}`, actions: canEdit ? [go("Day details", "day", tripId, day.id), { ...go("Add a stop", "stop", tripId), to: { screen: "stop", tripId, day: day.id } }, act(`Use Plan ${day.activePlan === "A" ? "B" : "A"}`, "day.plan", { id: day.id, plan: day.activePlan === "A" ? "B" : "A" })] : [] });
  const active = day.stops.filter(s => s.plan === day.activePlan && s.status !== "SKIPPED");
  for (const [i, stop] of active.entries()) {
    const s = effectiveStop(stop);
    const reordered = (delta: number) => { const ids = active.map(s => s.id); const at = i + delta; [ids[i], ids[at]] = [ids[at], ids[i]]; return [...ids, ...day.stops.filter(s => s.plan === day.activePlan && s.status === "SKIPPED").map(s => s.id)]; };
    blocks.push({ id: stop.id, title: s.title, meta: [s.startTime ?? "Anytime", s.durationMin ? `${s.durationMin} min` : "", s.estCostMinor === null ? "" : `Est. ${formatMoney(s.estCostMinor, s.currency ?? trip.currency)}`, stop.booking ? stop.booking.status : ""].filter(Boolean).join(" · "), text: s.reason ?? undefined, lines: [s.address, s.notes, stop.hoursNote, stop.bookingNote].filter((v): v is string => Boolean(v)), actions: [
      { label: "Directions", url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.title, s.address].filter(Boolean).join(", "))}` }, ...link("Official website", s.officialUrl),
      ...(canEdit ? [go("Edit", "stop", tripId, stop.id), ...(i > 0 ? [act("Move up", "stop.reorder", { dayId: day.id, plan: day.activePlan, ids: reordered(-1) })] : []), ...(i < active.length - 1 ? [act("Move down", "stop.reorder", { dayId: day.id, plan: day.activePlan, ids: reordered(1) })] : [])] : []),
    ] });
  }
  const meals = readMealOptions(day.mealOptions);
  for (const meal of ["breakfast", "lunch", "dinner"] as const) for (const [i, r] of meals[meal].entries()) blocks.push({ id: `${meal}-${i}`, title: `${meal[0].toUpperCase()}${meal.slice(1)} · Option ${i + 1}`, meta: `${r.name} · ${r.cuisine} · ${r.area}`, text: r.whyFits, actions: link("Restaurant website", r.officialUrl) });
  if (day.planBNote) blocks.push({ id: "plan-b-note", title: "Plan B", text: day.planBNote });
  for (const s of [...day.stops.filter(s => s.status === "SKIPPED"), ...ideas]) blocks.push({ id: s.id, title: s.title, meta: s.status === "SKIPPED" ? "Skipped" : "Unscheduled idea", actions: canEdit ? [go("Edit / schedule", "stop", tripId, s.id)] : [] });
  return { blocks };
}

import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getChatPage } from "@/server/chat/service";
import { getMemberLocations } from "@/server/locations/service";
import { listPolls } from "@/server/voting/service";
import { isCompanyAccount, requireCompanyAdmin } from "@/server/admin/identity";
import { adminSecurityStatus } from "@/server/admin/security";
import * as admin from "@/server/admin/operations";
import { listCompanyTrials } from "@/server/admin/trials";
import { normalUserMode } from "@/server/cloudflare/runtime";
import { formatMoney } from "@/lib/money";
import { f, act, go, form, options, tripFields, tripFormValues } from "./presentation";
import type { MobileBlock, MobileWorkspace } from "@/lib/mobile-workspace";

export async function peopleBlocks(userId: string, tripId: string, screen: string, query: URLSearchParams, role: string): Promise<{ blocks: MobileBlock[]; pollMs?: number }> {
  const canEdit = role !== "VIEWER", owner = role === "OWNER";
  if (screen === "chat") {
    const before = query.get("before");
    const data = await getChatPage(userId, tripId, before && /^\d+$/.test(before) ? { before: Number(before) } : {});
    return { pollMs: 3000, blocks: [
      { id: "tools", actions: [go("Member locations", "locations", tripId), act("Mark chat read", "chat", { op: "read", seq: Math.max(data.summary.readSeq, ...data.messages.map(m => m.seq)) })] },
      ...(data.hasMore && data.messages[0] ? [{ id: "earlier", actions: [{ label: "Earlier messages", to: { screen: "chat", tripId, before: String(data.messages[0].seq) } }] }] : []),
      ...data.messages.map(m => ({ id: m.id, title: m.senderName, text: m.deletedAt ? "Message deleted" : m.body, meta: m.createdAt, actions: !m.deletedAt && (m.senderId === userId || owner) ? [act("Delete message", "chat", { op: "delete", id: m.id }, "Delete this message for the group?")] : [] })),
      form("chat", "Message the group", "chat", [f("body", "Message", "long", { required: true })], { op: "send", clientId: crypto.randomUUID() }, "Send"),
    ] };
  }
  if (screen === "locations") {
    const data = await getMemberLocations(userId, tripId);
    return { pollMs: 20000, blocks: [{ id: "self", title: "Your location", text: "Sharing is optional. Updates stop when you leave this screen or background the app. If the connection drops, the last point expires within two minutes.", location: { tripId } },
      ...data.members.map(m => { const p = data.locations.find(p => p.userId === m.userId); return { id: m.userId, title: m.name, meta: p ? `Updated ${p.updatedAt} · accuracy ±${Math.round(p.accuracy)} m` : "Not sharing", actions: p ? [{ label: "View on map", url: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` }] : [] }; }),
    ] };
  }
  if (screen === "votes") {
    const data = await listPolls(userId, tripId);
    const blocks: MobileBlock[] = [];
    for (const p of data.polls) {
      blocks.push({ id: p.id, title: p.question, meta: `${p.status} · ${p.totalVotes} votes`, text: p.decisionNote ?? undefined, lines: p.options.map(o => `${o.id === p.chosenOptionId ? "✓ " : ""}${o.label}: ${o.count}${o.id === p.myOptionId ? " · Your vote" : ""}`), actions: p.status === "OPEN" ? [...p.options.map(o => act(o.id === p.myOptionId ? `Undo vote: ${o.label}` : `Vote: ${o.label}`, "poll.vote", { id: p.id, version: p.version, optionId: o.id === p.myOptionId ? null : o.id }))] : [] });
      if (data.canDecide) blocks.push(form(`decide-${p.id}`, "Organizer decision", "poll.decide", [f("command", "Action", "select", { options: options(p.status === "OPEN" ? ["DECIDE", "ARCHIVE"] : ["REOPEN", "ARCHIVE"]), value: p.status === "OPEN" ? "DECIDE" : "REOPEN" }), f("optionId", "Chosen option", "select", { options: [{ value: "", label: "None" }, ...p.options.map(o => ({ value: o.id, label: o.label }))] }), f("note", "Decision note", "long")], { id: p.id, version: p.version, optionId: p.chosenOptionId, note: p.decisionNote }, "Save decision"));
    }
    if (data.canCreate) blocks.push(form("poll", "Ask the group", "poll.create", [f("question", "Question", "text", { required: true }), f("kind", "Type", "select", { options: options(["DESTINATION", "ACTIVITY"]), value: "ACTIVITY" }), f("options", "Choices", "list", { hint: "2–8 choices, one per line" })], {}, "Create vote"));
    return { blocks: blocks.length ? blocks : [{ id: "empty", text: "Your group’s votes will appear here." }] };
  }
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, include: { memberships: { include: { user: { select: { id: true, name: true, email: true } } } }, travelers: { orderBy: { createdAt: "asc" } }, invitations: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } } } });
  if (screen === "settings") {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId_tripId: { userId, tripId } } });
    return { blocks: [
      { id: "settings-nav", actions: [go("Travelers & sharing", "sharing", tripId), go("Premium pass", "premium", tripId), go("Group voting", "votes", tripId), { label: "Export trip JSON", device: "file", url: `/api/mobile/files?tripId=${encodeURIComponent(tripId)}&kind=json`, fileName: "Tripanize-trip.json" }] },
      form("change-alerts", "Your trip change alerts", "notifications.changes", [f("enabled", "Email trip changes", "check")], { enabled: pref?.changeEmailEnabled ?? false }),
      form("booking-alerts", "Your booking reminders", "notifications.bookings", [f("enabled", "Email booking deadlines", "check")], { enabled: pref?.bookingReminderEmailEnabled ?? false }),
      ...(canEdit ? [form("details", "Trip details", "trip.update", tripFields(), await tripFormValues(tripId))] : [{ id: "view", text: "You have viewer access. The organizer or an editor can change the trip." }]),
      ...(owner ? [{ ...form("delete", "Delete this trip", "trip.delete", [f("name", "Type the exact trip name", "text", { hint: trip.name })], {}, "Delete trip"), form: { action: "trip.delete", fields: [f("name", "Type the exact trip name", "text", { hint: trip.name })], label: "Delete trip", confirm: "Permanently delete this trip for everyone? This cannot be undone." } }] : [{ id: "leave", actions: [act("Leave trip", "member.remove", { id: userId }, "Leave this trip? You will need a new invitation to rejoin.")] }]),
    ] };
  }
  const blocks: MobileBlock[] = [{ id: "roles", text: "One organizer manages access. Editors can change the trip; viewers can follow it and participate in votes." }];
  for (const m of trip.memberships) {
    blocks.push({ id: m.id, title: m.user.name, meta: `${m.user.email} · ${m.role === "OWNER" ? "Organizer" : m.role === "COLLABORATOR" ? "Editor" : "Viewer"}`, actions: owner && m.role !== "OWNER" ? [act(m.role === "VIEWER" ? "Make editor" : "Make viewer", "member.role", { id: m.userId, role: m.role === "VIEWER" ? "COLLABORATOR" : "VIEWER" }), act("Transfer organizer role", "member.transfer", { id: m.userId }, `Make ${m.user.name} the organizer? You will become an editor.`), act("Remove member", "member.remove", { id: m.userId }, `Remove ${m.user.name} from this trip?`)] : [] });
  }
  if (owner) blocks.push(form("invite", "Invite someone", "invite.create", [f("email", "Email address (optional)"), f("role", "Access", "select", { options: [{ value: "COLLABORATOR", label: "Editor" }, { value: "VIEWER", label: "Viewer" }], value: "VIEWER" }), f("travelerId", "Connect to a planned traveler", "select", { options: [{ value: "", label: "Create a new traveler" }, ...trip.travelers.filter(t => !t.userId && !t.leftAt).map(t => ({ value: t.id, label: t.name }))] })], {}, "Create invitation"));
  for (const inv of trip.invitations) if (owner) blocks.push({ id: inv.id, title: inv.email ?? "Invitation link", meta: `${inv.role} · Expires ${inv.expiresAt.toISOString().slice(0, 10)} · ${inv.emailStatus ?? "Link only"}`, actions: [act("Revoke invitation", "invite.revoke", { id: inv.id }, "Revoke this unused invitation?")] });
  blocks.push({ id: "travelers-heading", title: "Planned travelers" });
  for (const t of trip.travelers) {
    blocks.push({ id: t.id, title: t.name, meta: `${t.isChild ? "Child" : "Adult"}${t.leftAt ? " · Left the trip" : ""}`, actions: canEdit && !t.userId ? [act("Remove traveler", "traveler.remove", { id: t.id }, "Remove this planned traveler? Existing expense records are retained.")] : [] });
    if (canEdit) blocks.push(form(`rename-${t.id}`, `Rename ${t.name}`, "traveler.rename", [f("name", "Display name", "text", { value: t.name })], { id: t.id }));
  }
  if (canEdit) blocks.push(form("add-traveler", "Add a planned traveler", "traveler.add", [f("name", "Name"), f("isChild", "Child", "check", { value: false })], {}, "Add traveler"));
  return { blocks };
}

export async function adminBlocks(userId: string, screen: string, query: URLSearchParams): Promise<MobileWorkspace> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!isCompanyAccount(user)) throw new AppError("FORBIDDEN", "This account cannot access administrator tools.");
  const security = await adminSecurityStatus(userId);
  const doc: MobileWorkspace = { title: "Tripanize Admin", blocks: [] };
  if (!security.unlocked) {
    doc.blocks = [{ id: "security", title: "Unlock Admin with email", text: `A separate code is sent to ${security.email}. Admin access lasts 30 minutes.`, actions: [act("Send admin code", "admin.security", { op: "send-code" })] }, form("unlock", "Enter your email code", "admin.security", [f("code", "6-digit code", "text", { required: true })], { op: "unlock" }, "Unlock Admin")]; return doc;
  }
  if (normalUserMode(userId)) { doc.blocks = [{ id: "mode", text: "You are testing in Normal mode. Premium remains included.", actions: [act("Switch to Admin mode", "admin.mode", { mode: "ADMIN" })] }]; return doc; }
  await requireCompanyAdmin(userId);
  doc.tabs = [["Overview", "admin"], ["Trials", "admin-trials"], ["Users", "admin-users"], ["Trips", "admin-trips"], ["Payments", "admin-payments"], ["AI", "admin-ai"], ["Support", "admin-support"], ["Health", "admin-health"], ["Announcements", "admin-announcements"], ["Activity", "admin-activity"]].map(([label, screen]) => ({ label, to: { screen } }));
  doc.blocks.push({ id: "session", meta: `Admin until ${security.verifiedUntil}`, actions: [act("Switch to Normal mode", "admin.mode", { mode: "NORMAL" }), act("Lock Admin", "admin.security", { op: "lock" })] });
  const page = Math.max(0, Math.min(10000, Number(query.get("before")) || 0)), term = query.get("item")?.slice(0, 100) ?? "";
  const pagination = (total: number, size: number) => doc.blocks.push({ id: "pages", meta: `Page ${page + 1} · ${total} records`, actions: [...(page > 0 ? [{ label: "Previous", to: { screen, item: term, before: String(page - 1) } }] : []), ...(total > (page + 1) * size ? [{ label: "Next", to: { screen, item: term, before: String(page + 1) } }] : [])] });
  if (screen === "admin") {
    const summary = await admin.adminOverview(userId);
    doc.blocks.push({ id: "summary", title: `${summary.users} users · ${summary.trips} trips`, lines: [`${summary.activeUsers} active users in 30 days`, `${summary.verifiedPurchases} verified purchases`, `Sales: ${formatMoney(summary.salesMinor, "USD")}`, `${summary.pendingPayments} pending payments`, `${summary.trials} accepted trials`, `${summary.openSupport} open support requests`, `${summary.aiRequests} AI requests · ${summary.failedAi} failed`] });
  } else if (screen === "admin-trials") {
    doc.blocks.push(form("trial", "Invite someone to try Premium", "trial.create", [f("email", "Recipient email", "text", { required: true }), f("durationDays", "Days of Premium", "number", { value: 14 })], {}, "Create trial invitation"));
    for (const t of await listCompanyTrials(userId)) {
      doc.blocks.push({ id: t.id, title: t.email, meta: t.status, text: t.tripName ?? "One trip · not yet selected", lines: [`Email: ${t.emailStatus}`, `Trial ends: ${t.trialEndsAt ?? "On activation / until revoked"}`], actions: !t.status.startsWith("Revoked") ? [act("Revoke trial", "trial.revoke", { id: t.id }, "Revoke Premium trial access for this trip?")] : [] });
      if (t.status === "Active trial") doc.blocks.push(form(`expiry-${t.id}`, "Adjust trial expiry", "admin.command", [f("endsAt", "New expiry (ISO timestamp)", "text", { hint: "For example 2026-12-01T12:00:00Z. Blank means until revoked.", value: t.trialEndsAt })], { op: "trial.expiry", id: t.id }));
    }
  } else if (screen === "admin-users" || screen === "admin-trips") {
    doc.blocks.push(form("search", "Search", "admin.search", [f("q", "Name, destination or email", "text", { value: term })], { screen }, "Search"));
    if (screen === "admin-users") {
      const data = await admin.adminUsers(userId, term, page);
      for (const u of data.rows) {
        doc.blocks.push({ id: u.id, title: u.name, meta: u.email, text: `${u.suspendedAt ? "Suspended" : "Active"} · ${u._count.memberships} trips`, actions: [] });
        if (!u.administrator) doc.blocks.push(form(`suspend-${u.id}`, u.suspendedAt ? "Restore account" : "Suspend account", "admin.command", [f("reason", "Reason")], { op: "user.suspend", id: u.id, suspended: !u.suspendedAt }, u.suspendedAt ? "Restore" : "Suspend"));
      } pagination(data.total, 25);
    } else {
      const data = await admin.adminTrips(userId, term, page);
      for (const t of data.rows) doc.blocks.push({ id: t.id, title: t.name, meta: `${t.owner.email} · ${t.people} travelers · ${t.plan}`, lines: [t.destinations.map(d => d.name).join(" · "), t.startDate ?? "No dates", `Access source: ${t.source ?? "Standard"}`] });
      pagination(data.total, 25);
    }
  } else if (screen === "admin-payments") {
    const data = await admin.adminPayments(userId, page);
    for (const p of data.rows) doc.blocks.push({ id: p.id, title: `${p.trip.name} · ${formatMoney(p.amountMinor, "USD")}`, meta: `${p.status} · ${p.buyerEmail ?? ""}`, text: p.reviewRequired ? "Requires review" : undefined, actions: p.transactionId ? [act("Refresh payment status", "admin.command", { op: "payment.sync", id: p.id })] : [] });
    pagination(data.total, 25);
  } else if (screen === "admin-ai") {
    const data = await admin.adminAi(userId), s = data.settings;
    doc.blocks.push({ id: "ai-summary", title: "AI usage · last 30 days", lines: [`${data.totals._count} requests`, `${data.totals._sum.inputTokens ?? 0} input tokens`, `${data.totals._sum.outputTokens ?? 0} output tokens`, `${data.totals._sum.searchCalls ?? 0} searches`, `${data.unknownCosts} requests without configured costs`] });
    doc.blocks.push(form("ai-settings", "Usage controls", "admin.command", [f("aiPaused", "Pause AI", "check"), f("aiDailyLimit", "Platform daily requests", "number"), f("aiUserDailyLimit", "Per-user daily requests", "number"), f("pricingModel", "Model for cost estimates"), f("inputUsdPerMillion", "Input USD per million tokens", "number"), f("outputUsdPerMillion", "Output USD per million tokens", "number"), f("searchUsdPerThousand", "Search USD per thousand calls", "number")], { op: "ai.settings", aiPaused: s?.aiPaused ?? false, aiDailyLimit: s?.aiDailyLimit ?? null, aiUserDailyLimit: s?.aiUserDailyLimit ?? null, pricingModel: s?.pricingModel ?? null, inputUsdPerMillion: s?.inputUsdPerMillion ?? null, outputUsdPerMillion: s?.outputUsdPerMillion ?? null, searchUsdPerThousand: s?.searchUsdPerThousand ?? null }));
    for (const r of data.rows) doc.blocks.push({ id: r.id, title: `${r.model} · ${r.status}`, meta: r.createdAt.toISOString() });
  } else if (screen === "admin-support") {
    const data = await admin.adminSupport(userId, page);
    for (const r of data.rows) doc.blocks.push(form(r.id, `${r.name} · ${r.topic}: ${r.message}`, "admin.command", [f("status", "Status", "select", { options: options(["OPEN", "IN_PROGRESS", "RESOLVED"]), value: r.status }), f("note", "Internal note", "long", { value: r.note })], { op: "support.update", id: r.id }));
    pagination(data.total, 20);
  } else if (screen === "admin-health") {
    const h = await admin.adminHealth(userId);
    doc.blocks.push({ id: "health", title: "Service health", lines: [`AI configured: ${h.aiConfigured}`, `Email configured: ${h.emailConfigured}`, `Support configured: ${h.supportConfigured}`, `Payments configured: ${h.paddleConfigured}`, `Queued/failed emails: ${h.emails}`, `Queued/failed trial emails: ${h.trialEmails}`], actions: [act("Wake background queue", "admin.command", { op: "health.wake" })] });
    for (const j of h.jobs) doc.blocks.push({ id: j.id, title: `${j.kind} · ${j.status}`, text: j.errorCode ?? undefined, meta: j.createdAt.toISOString() });
  } else if (screen === "admin-announcements") {
    doc.blocks.push(form("announcement", "Create announcement", "admin.command", [f("title", "Title"), f("message", "Message", "long"), f("tone", "Type", "select", { options: options(["info", "maintenance"]), value: "info" }), f("startsAt", "Starts (ISO timestamp)", "text", { value: new Date().toISOString() }), f("endsAt", "Ends (optional ISO timestamp)")], { op: "announcement.create" }));
    for (const a of await admin.adminAnnouncements(userId)) doc.blocks.push({ id: a.id, title: a.title, text: a.message, meta: a.status, actions: [act(a.status === "PUBLISHED" ? "Archive" : "Publish", "admin.command", { op: "announcement.status", id: a.id, version: a.version, status: a.status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED" }, "Change this announcement’s visibility?")] });
  } else if (screen === "admin-activity") {
    const data = await admin.adminActivity(userId, page);
    for (const a of data.rows) doc.blocks.push({ id: a.id, title: a.action, meta: a.createdAt.toISOString(), text: `${a.targetType} · ${a.targetId}` });
    pagination(data.total, 30);
  } else throw new AppError("NOT_FOUND", "Administrator screen not found.");
  return doc;
}

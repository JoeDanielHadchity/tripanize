import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";
import { getMobileUser, getMobileTrips } from "./service";
import { requireTrip } from "@/server/auth/permissions";
import { getTripPlan } from "@/server/plans/access";
import { PLAN_COMPARISON } from "@/lib/plans";
import { onboardingState } from "@/server/trips/onboarding";
import { getPlanQuestions } from "@/server/planner/questions";
import { getDestinationWorkspace, getDestinationSearch } from "@/server/destinations/service";
import { DISCOVERY_INTERESTS } from "@/server/destinations/schema";
import { listPendingInvitations } from "@/server/invitations/service";
import { pendingTrialInvitations } from "@/server/admin/trials";
import { listChangeNotifications } from "@/server/notifications/changes";
import { getProfile } from "@/server/profile";
import { isCompanyAccount } from "@/server/admin/identity";
import { normalUserMode } from "@/server/cloudflare/runtime";
import { storeConfig } from "@/server/billing/store";
import { itineraryBlocks } from "./workspace-itinerary";
import { travelBlocks } from "./workspace-travel";
import { expenseBlocks } from "./workspace-expenses";
import { peopleBlocks, adminBlocks } from "./workspace-people";
import { f, act, go, form, options, tripFields, tripFormValues, wire } from "./presentation";
import { mobileTripTabs, type MobileWorkspace, type MobileBlock } from "@/lib/mobile-workspace";

const titles: Record<string, string> = { itinerary: "Itinerary", stop: "Edit your stop", day: "Day details", plan: "Plan your trip", job: "Your itinerary draft", versions: "Itinerary history", expenses: "Expenses", expense: "Record a payment", settlement: "Record a repayment", chat: "Chat & locations", locations: "Member locations", assistant: "Trip assistant", events: "Events & bookings", event: "Add an event", bookings: "Bookings", booking: "Booking details", packing: "Packing & prep", settings: "Trip settings", sharing: "Travelers & sharing", votes: "Group decisions", setup: "Create your trip", premium: "Premium pass" };
export async function workspace(userId: string, query: URLSearchParams): Promise<MobileWorkspace> {
  await getMobileUser(userId);
  const screen = (query.get("screen") ?? "trips").slice(0, 40), tripId = query.get("tripId") ?? undefined, item = query.get("item") ?? undefined;
  if (screen === "new") return { title: "A new adventure.", blocks: [form("create", "Name your trip", "trip.create", [f("name", "Trip name", "text", { required: true })], {}, "Choose a plan")] };
  if (screen === "trips") {
    const [trips, pending, trials] = await Promise.all([getMobileTrips(userId), listPendingInvitations(userId), pendingTrialInvitations(userId)]);
    return { title: "My trips.", blocks: [
      { id: "tools", actions: [go("Create a trip", "new"), go("Help me choose", "discovery"), go("Notifications", "notifications")] },
      ...trials.map(t => form(t.id, "Your Premium trial invitation", "trial.accept", [f("tripId", "Choose a trip", "select", { options: [{ value: "", label: "Create a new trip" }, ...trips.trips.filter(trip => trip.role === "OWNER" && !trip.premium).map(trip => ({ value: trip.id, label: trip.name }))], value: "" }), f("name", "New trip name (for a new trip)")], { invitationId: t.id }, "Activate my trial")),
      ...pending.map(p => ({ id: p.id, title: p.tripName, text: `${p.from} invited you as ${p.role === "VIEWER" ? "a viewer" : "an editor"}.`, actions: [act("Accept", "invite.accept", { id: p.id }), act("Decline", "invite.decline", { id: p.id })] })),
      ...trips.trips.map(t => ({ id: t.id, title: t.name, meta: `${t.destinations.join(" · ")} · ${t.startDate ?? "Dates to come"}${t.premium ? " · ★ Premium" : ""}`, actions: [go("Open trip", t.onboardingStage === "COMPLETE" ? "itinerary" : "setup", t.id)] })),
      form("link", "Join with an invitation", "invite.token", [f("token", "Invitation link or token", "text", { hint: "Paste the Tripanize invitation you received." })], {}, "Join trip"),
    ] };
  }
  if (screen === "notifications") {
    const inbox = await listChangeNotifications(userId, item);
    return { title: "Notifications", subtitle: `${inbox.unread} unread`, pollMs: 20000, blocks: [
      { id: "read", actions: [act("Mark all read", "notifications.read", { before: inbox.checkedAt })] },
      ...inbox.items.map(n => { const match = /^\/trips\/([^/]+)\/([^/?#]+)/.exec(n.href); return { id: n.id, title: n.tripName, text: n.summary, meta: `${n.createdAt}${n.readAt ? "" : " · Unread"}`, actions: [...(match ? [go("View change", match[2] === "today" ? "packing" : match[2], match[1])] : []), ...(!n.readAt ? [act("Mark read", "notifications.read", { id: n.id })] : [])] }; }),
      ...(inbox.nextCursor ? [{ id: "older", actions: [go("Older notifications", "notifications", undefined, inbox.nextCursor)] }] : []),
    ] };
  }
  if (screen === "account") {
    const { user, profile } = await getProfile(userId); const company = isCompanyAccount(user);
    return { title: "My account.", subtitle: user.email, blocks: [
      { id: "navigation", actions: [go("Notifications", "notifications"), go("Invitations", "trips"), ...(company ? [go("Admin access", "admin")] : [])] },
      ...(company ? [{ id: "included", title: "Premium always included", text: "Every Premium feature is available on trips you organize or join, in both account modes.", tone: "accent" as const }] : []),
      form("profile", "Travel preferences", "profile.save", [f("name", "Display name"), f("homeCity", "Home city"), f("defaultCurrency", "Default currency"), f("pace", "Pace", "select", { options: options(["RELAXED", "BALANCED", "AMBITIOUS"]) }), f("interests", "Interests", "list"), f("dietary", "Dietary needs", "long"), f("accessibility", "Accessibility", "long"), f("mapsApp", "Maps app", "select", { options: [{ value: "GOOGLE", label: "Google Maps" }, { value: "APPLE", label: "Apple Maps" }, { value: "OSM", label: "OpenStreetMap" }] }), f("timezone", "Time zone")], { ...wire(profile) as Record<string, import("@/lib/mobile-workspace").MobileValue>, name: user.name }),
      form("support", "Contact support", "support.send", [f("topic", "Topic", "select", { options: options(["general", "technical", "billing", "privacy"]), value: "general" }), f("message", "Message", "long", { required: true })], { requestId: crypto.randomUUID() }, "Send support request"),
      { id: "legal", actions: [{ label: "Privacy policy", url: "https://www.tripanize.app/privacy" }, { label: "Terms", url: "https://www.tripanize.app/terms" }] },
      ...(!company ? [{ id: "delete-account", title: "Delete account", text: "Transfer or delete trips you organize first. Your private lists, searches and sign-ins are removed. Shared trip records remain under Former traveler. Sign in with an email code immediately before deleting.", form: { action: "account.delete", label: "Permanently delete my account", confirm: "Permanently delete your Tripanize account? This cannot be undone.", fields: [f("email", "Your email"), f("confirmation", "Type DELETE")] } }] : []),
    ] };
  }
  if (screen.startsWith("admin")) return adminBlocks(userId, screen, query);
  if (screen === "discovery") {
    const searches = await getDestinationWorkspace(userId), search = item ? await getDestinationSearch(userId, item) : searches.current;
    const blocks: MobileBlock[] = [{ id: "searches", actions: [...searches.searches.map(s => go(`Search #${s.number}`, "discovery", undefined, s.id)), act("New search", "discovery.draft")] }];
    if (search) blocks.push({ id: "delete-search", actions: [{ ...act("Delete search", "discovery.delete", { id: search.id }, `Delete Search #${search.number}? Its saved answers and results will be removed. Any trip you created from it will be kept.`), danger: true }] });
    if (!search) blocks.push({ id: "empty", text: "Start a search to find five places that fit your preferences." });
    if (search && search.status === "DRAFT") blocks.push(form("discover", `Search #${search.number}`, "discovery.run", [f("departureCity", "Departure city & country", "text", { required: true }), f("timing", "When?", "select", { options: options(["dates", "month", "flexible"]) }), f("startDate", "Start date", "date"), f("endDate", "End date", "date"), f("month", "Travel month", "text", { hint: "YYYY-MM" }), f("days", "Number of days", "number"), f("adults", "Adults", "number"), f("children", "Children", "number"), f("budget", "Whole-trip budget per person (USD)", "number"), f("climate", "Weather", "select", { options: options(["Warm & sunny", "Mild & comfortable", "Cold or snowy", "No preference"]) }), f("interests", "What do you enjoy?", "multi", { options: options(DISCOVERY_INTERESTS) }), f("pace", "Pace", "select", { options: options(["RELAXED", "BALANCED", "AMBITIOUS"]) }), f("distance", "Travel distance", "select", { options: options(["Nearby — up to 3 hours", "Up to 6 hours", "Anywhere"]) }), f("crowds", "Crowds", "select", { options: options(["Quiet & less crowded", "A balance", "Lively & popular"]) }), f("constraints", "Anything else?", "long")], { ...wire(search.input) as Record<string, import("@/lib/mobile-workspace").MobileValue>, id: search.id }, "Find five destinations"));
    if (search?.error) blocks.push({ id: "error", text: search.error, tone: "warning", actions: [act("Start a new search", "discovery.draft")] });
    if (search?.result) {
      blocks.push({ id: "summary", text: search.result.summary });
      for (const [index, idea] of search.result.ideas.entries()) blocks.push({ id: `idea-${index}`, title: `${idea.destination}, ${idea.country}`, meta: idea.bestTime, text: idea.whyFits, lines: [idea.weather, idea.season, ...idea.experiences, idea.budgetNote, idea.travelNote, idea.tradeoff], actions: [act("Choose this destination", "discovery.choose", { id: search.id, index }), ...idea.sourceUrls.map(url => ({ label: "Source", url }))] });
    }
    if (search && ["QUEUED", "RUNNING"].includes(search.status)) blocks.push({ id: "working", title: "Finding your places…", text: "You can leave this screen and return when the search is ready." });
    return { title: "Somewhere you’ll love.", blocks, ...(search && ["QUEUED", "RUNNING"].includes(search.status) ? { pollMs: 4000 } : {}) };
  }
  if (!tripId || !titles[screen]) throw new AppError("NOT_FOUND", "App screen not found.");
  const access = await requireTrip(tripId, userId), plan = await getTripPlan(tripId), canEdit = access.role !== "VIEWER";
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { name: true, startDate: true, endDate: true, destinations: { orderBy: { position: "asc" }, select: { name: true } } } });
  const doc: MobileWorkspace = { title: titles[screen], tripId, premium: plan.premium, role: access.role, trip: { ...trip, destinations: trip.destinations.map(d => d.name) }, blocks: [], tabs: mobileTripTabs(tripId) };
  if (screen === "premium" || (screen === "setup" && (await onboardingState(userId, tripId)).onboardingStage === "PLAN")) {
    doc.blocks = [{ id: "premium", title: "Premium pass · $15 per trip", text: plan.premium ? `Premium is active${plan.validUntil ? ` until ${plan.validUntil}` : ""}. Everyone in this trip is included.` : "One payment covers your whole group. No subscription.", tone: "accent", lines: PLAN_COMPARISON.map(row => `${row.feature}: ${row.premium}`) },
      { id: "standard", title: "Standard · Free", text: "AI planning for the first 2 days. Edit all days and add bookings and packing manually. Group roles and voting included." },
      ...(access.role === "OWNER" ? [{ id: "continue", actions: [act(plan.premium ? "Continue with Premium" : "Continue with Standard", "trip.standard")] }] : []),
      ...(!plan.premium ? [access.role !== "OWNER" ? { id: "store-owner", text: "Only the trip organizer can upgrade. Premium then covers everyone in this trip." }
        : storeConfig() ? { id: "store-purchase", title: "Upgrade this trip", text: "Pay once through Google Play or the App Store. No subscription, and everyone in this trip is included.", tone: "accent" as const, actions: [{ label: "★ Upgrade for $15", device: "purchase" as const }] }
        : { id: "store-setup", text: "In-app purchases are being set up. Existing purchased access and accepted trials work automatically.", tone: "warning" as const }] : []),
    ]; return doc;
  }
  if (["expenses", "expense", "settlement", "chat", "locations", "assistant", "events", "event"].includes(screen) && !plan.premium) {
    doc.blocks = [{ id: "locked", title: "★ Included with Premium", text: "The organizer can unlock this feature for the whole trip.", actions: [go("View Premium pass", "premium", tripId), ...(screen === "locations" ? [act("Stop my location sharing", "location", { op: "stop" })] : [])] }]; return doc;
  }
  if (screen === "setup") {
    const state = await onboardingState(userId, tripId);
    if (state.onboardingStage === "COMPLETE") { doc.blocks = [{ id: "ready", title: "Your trip is ready.", actions: [go("Open itinerary", "itinerary", tripId)] }]; return doc; }
    if (access.role !== "OWNER") { doc.blocks = [{ id: "owner", text: "The organizer is preparing this trip." }]; return doc; }
    if (state.onboardingStage === "DETAILS") doc.blocks = [form("details", "Tell us about your trip", "trip.details", tripFields(), await tripFormValues(tripId), "Continue")];
    else if (state.onboardingStage === "QUESTIONS") {
      const questions = await getPlanQuestions(userId, tripId, { poll: true });
      doc.blocks = [form("questions", "Make it yours", "setup.generate", [...questions.questions.map((q, i) => f(`answers.${i}.a`, q.q, "multi", { options: options(q.options), max: q.multi ? undefined : 1, required: true })), f("note", "Anything else?", "long"), f("foodNotes", "Food preferences & allergies", "long")], { answers: questions.questions.map(q => ({ q: q.q, a: [] })), note: "", foodNotes: "" }, "Generate my trip"), { id: "manual", actions: [act("Plan manually", "setup.manual")] }];
      if (questions.pendingJobId) { doc.blocks = [{ id: "questions-working", title: "Preparing your questions…" }]; doc.pollMs = 3000; }
    } else {
      doc.blocks = [{ id: "progress", title: "Preparing your trip…", text: state.job?.error ?? undefined, lines: Array.isArray(state.job?.progress) ? state.job.progress.flatMap(p => p && typeof p === "object" && "message" in p && typeof p.message === "string" ? [p.message] : []) : [], actions: state.job && ["FAILED", "CANCELLED"].includes(state.job.status) ? [act("Try again", "setup.retry")] : [] }]; doc.pollMs = 3000;
    } return doc;
  }
  if (["itinerary", "stop", "day", "versions", "plan", "job", "assistant"].includes(screen)) { const result = await itineraryBlocks(userId, tripId, screen, query, canEdit); doc.blocks = result.blocks; doc.pollMs = result.pollMs; doc.itinerary = result.itinerary; }
  else if (["expenses", "expense", "settlement"].includes(screen)) doc.blocks = await expenseBlocks(userId, tripId, screen, item, canEdit);
  else if (["events", "event", "bookings", "booking", "packing"].includes(screen)) doc.blocks = await travelBlocks(userId, tripId, screen, query, canEdit, plan.premium);
  else { const result = await peopleBlocks(userId, tripId, screen, query, access.role); doc.blocks = result.blocks; doc.pollMs = result.pollMs; }
  return doc;
}

import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { workspace } from "@/server/mobile/workspace";
import { mobileCommand } from "@/server/mobile/commands";
import { GET, POST } from "@/app/api/mobile/workspace/route";
import { getWorkerSession } from "@/server/auth/auth";
import { makeUser, makeTrip, resetDb, adminAuthenticationFixture } from "./helpers";
import { cleanValues, formDefaults, getValue, setValue } from "../../mobile/src/lib/workspace";
import { createBooking } from "@/server/bookings/service";
import { addCustomEvent } from "@/server/events/service";
import { GET as getFile, POST as uploadFile } from "@/app/api/mobile/files/route";
import { deleteMobileAccount } from "@/server/mobile/delete-account";
import { createDestinationDraft, getDestinationWorkspace } from "@/server/destinations/service";
import { getMobileDestinations } from "@/server/mobile/service";

vi.mock("@/server/auth/auth", () => ({ getWorkerSession: vi.fn() }));
const runtime = currentRuntime();
beforeEach(async () => { await resetDb(); setTestRuntime({ ...runtime, appUrl: "https://www.tripanize.app", planAccessEnabled: true }); vi.mocked(getWorkerSession).mockReset(); });
afterEach(() => setTestRuntime(runtime));
const cmd = (userId: string, tripId: string | undefined, action: string, values: Record<string, unknown> = {}) => mobileCommand(userId, { action, ...(tripId ? { tripId } : {}), values });
const page = (userId: string, screen: string, tripId?: string, item?: string) => workspace(userId, new URLSearchParams({ screen, ...(tripId ? { tripId } : {}), ...(item ? { item } : {}) }));
async function premium(tripId: string, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.trialInvitation.create({ data: { tripId, email: user.email, emailText: "Mobile fixture", tokenHash: randomUUID(), createdById: userId, acceptedById: userId, acceptedAt: new Date(), expiresAt: new Date(Date.now() + 86400000), trialEndsAt: new Date(Date.now() + 86400000) } });
}

it("offers confirmed destination-search deletion on mobile and enforces ownership", async () => {
  const owner = await makeUser("Explorer"), other = await makeUser("Other");
  const first = await createDestinationDraft(owner.id), second = await createDestinationDraft(owner.id);
  const doc = await page(owner.id, "discovery", undefined, first.id);
  const remove = doc.blocks.flatMap(b => b.actions ?? []).find(a => a.action === "discovery.delete")!;
  expect(remove).toMatchObject({ label: "Delete search", danger: true, values: { id: first.id } });
  expect(remove.confirm).toContain("Delete Search #1?");
  await expect(cmd(other.id, undefined, "discovery.delete", { id: first.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await cmd(owner.id, undefined, "discovery.delete", { id: first.id })).toMatchObject({ to: { screen: "discovery" } });
  expect((await getDestinationWorkspace(owner.id)).searches.map(s => s.id)).toEqual([second.id]);
  expect((await getMobileDestinations(owner.id)).searches.map(s => s.id)).toEqual([second.id]);
  await expect(page(owner.id, "discovery", undefined, first.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("requires authentication and same-origin or branded native-origin writes, including malformed requests", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id);
  expect((await GET(new Request("https://www.tripanize.app/api/mobile/workspace?screen=trips"))).status).toBe(401);
  const session = await prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: owner.id, expiresAt: new Date(Date.now() + 86400000) } });
  vi.mocked(getWorkerSession).mockResolvedValue({ user: owner, session });
  for (const origin of [undefined, "https://attacker.test", "null", "tripanize://attacker"]) {
    const response = await POST(new Request("https://www.tripanize.app/api/mobile/workspace", { method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify({ tripId, action: "traveler.add", values: { name: "Intruder", isChild: false } }) }));
    expect(response.status).toBe(403); expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  }
  for (const origin of ["tripanize://", "https://www.tripanize.app"]) {
    const response = await POST(new Request("https://www.tripanize.app/api/mobile/workspace", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ tripId, action: "traveler.add", values: { name: `Allowed ${origin}`, isChild: false } }) }));
    expect(response.status).toBe(200);
  }
  const malformed = await POST(new Request("https://www.tripanize.app/api/mobile/workspace", { method: "POST", headers: { "Content-Type": "application/json", Origin: "tripanize://" }, body: "{" }));
  expect(malformed.status).toBe(400);
  const oversized = await POST(new Request("https://www.tripanize.app/api/mobile/workspace", { method: "POST", headers: { "Content-Type": "application/json", Origin: "tripanize://" }, body: JSON.stringify({ pad: "x".repeat(100000) }) }));
  expect(oversized.status).toBe(400);
});

it("exposes the full trip navigation, one selected day, and native forms without leaking other trips", async () => {
  const owner = await makeUser("Owner"), stranger = await makeUser("Stranger"), tripId = await makeTrip(owner.id);
  const doc = await page(owner.id, "itinerary", tripId);
  expect(doc.tabs?.map(t => t.label)).toEqual(["Itinerary", "Expenses", "Chat & locations", "Events & bookings", "Packing", "Trip settings"]);
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  await cmd(owner.id, tripId, "stop.save", { dayId: days[0].id, plan: "A", title: "First day stop" });
  await cmd(owner.id, tripId, "stop.save", { dayId: days[1].id, plan: "A", title: "Second day stop" });
  const selected = await page(owner.id, "itinerary", tripId, days[1].id);
  expect(selected.blocks.some(b => b.title === "Second day stop")).toBe(true);
  expect(selected.blocks.some(b => b.title === "First day stop")).toBe(false);
  await expect(page(stranger.id, "settings", tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(cmd(stranger.id, tripId, "stop.save", { dayId: days[0].id, plan: "A", title: "Unauthorized" })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("enforces viewer restrictions and optimistic concurrency through the mobile commands", async () => {
  const owner = await makeUser("Owner"), viewer = await makeUser("Viewer"), tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const day = await prisma.itineraryDay.findFirstOrThrow({ where: { tripId } });
  await expect(cmd(viewer.id, tripId, "stop.save", { dayId: day.id, plan: "A", title: "No" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await cmd(owner.id, tripId, "stop.save", { dayId: day.id, plan: "A", title: "Original" });
  const stop = await prisma.stop.findFirstOrThrow({ where: { tripId } });
  await cmd(owner.id, tripId, "stop.save", { id: stop.id, version: stop.version, dayId: day.id, plan: "A", title: "Updated" });
  await expect(cmd(owner.id, tripId, "stop.save", { id: stop.id, version: stop.version, dayId: day.id, plan: "A", title: "Stale" })).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await prisma.stop.findUniqueOrThrow({ where: { id: stop.id } })).title).toBe("Updated");
  await expect(cmd(viewer.id, tripId, "member.role", { id: owner.id, role: "VIEWER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("preserves Standard restrictions even when a native request forges Premium fields", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id);
  for (const screen of ["expenses", "chat", "locations", "assistant", "events"]) {
    const doc = await page(owner.id, screen, tripId);
    expect(doc.blocks[0].id).toBe("locked");
  }
  const travelers = await prisma.traveler.findMany({ where: { tripId } });
  const expense = { description: "Attempt", category: "Other", amount: "10", currency: "EUR", date: "2027-05-01", payerId: travelers[0].id, method: "EQUAL", participants: travelers.map(t => ({ travelerId: t.id })) };
  await expect(cmd(owner.id, tripId, "expense.save", { ...expense, premium: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(cmd(owner.id, tripId, "chat", { op: "send", clientId: randomUUID(), body: "Not entitled" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await cmd(owner.id, tripId, "booking.save", { title: "Manual hotel", category: "ACCOMMODATION", status: "IDEA", currency: "EUR" });
  expect(await prisma.booking.count({ where: { tripId } })).toBe(1);
  await cmd(owner.id, tripId, "packing.add", { label: "Passport", category: "Documents", quantity: 1, shared: false });
  expect(await prisma.packingItem.count({ where: { tripId } })).toBe(1);
});

it("records real expenses separately from projections and presents who owes whom", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id, { budget: "500" });
  await premium(tripId, owner.id);
  await createBooking(owner.id, tripId, { title: "Museum", category: "ATTRACTION", status: "TO_BOOK", currency: "EUR", estCost: "40" });
  const travelers = await prisma.traveler.findMany({ where: { tripId } });
  await cmd(owner.id, tripId, "expense.save", { description: "Lunch", category: "Food & drink", amount: "60", currency: "EUR", date: "2027-05-01", payerId: travelers[0].id, method: "EQUAL", participants: travelers.map(t => ({ travelerId: t.id })) });
  const doc = await page(owner.id, "expenses", tripId);
  expect(doc.blocks.find(b => b.id === "budget")?.title).toContain("500");
  expect(doc.blocks.find(b => b.id === "budget")?.text).toContain("440");
  expect(doc.blocks.find(b => b.id === "projection")?.text).toContain("40");
  expect(doc.blocks.find(b => b.id === "ledger-EUR")?.lines?.[0]).toContain("owes");
  const expense = await prisma.expense.findFirstOrThrow({ where: { tripId } });
  const editor = await page(owner.id, "expense", tripId, expense.id);
  expect(editor.blocks.find(b => b.form?.upload === "expense")?.form?.fields.some(f => f.kind === "files")).toBe(true);
});

it("keeps personal packing private while viewers can pack their own items", async () => {
  const owner = await makeUser("Owner"), viewer = await makeUser("Viewer"), tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  await cmd(owner.id, tripId, "packing.add", { label: "Private medication", category: "Health", quantity: 1, shared: false });
  await cmd(viewer.id, tripId, "packing.add", { label: "My hat", category: "Clothing", quantity: 1, shared: false });
  const doc = await page(viewer.id, "packing", tripId);
  expect(JSON.stringify(doc)).not.toContain("Private medication");
  expect(JSON.stringify(doc)).toContain("My hat");
  const other = await prisma.packingItem.findFirstOrThrow({ where: { ownerId: owner.id } });
  await expect(cmd(viewer.id, tripId, "packing.update", { id: other.id, version: other.version, packed: true })).rejects.toMatchObject({ code: "NOT_FOUND" });
});

it("links suggested events to bookings and supports hide/undo without duplicate reservations", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id); await premium(tripId, owner.id);
  await addCustomEvent(owner.id, tripId, { title: "Local concert", date: "2027-05-02", venue: "Town hall" });
  const event = await prisma.tripEvent.findFirstOrThrow({ where: { tripId } });
  const draft = await page(owner.id, "booking", tripId, event.id);
  const b = draft.blocks.find(b => b.form?.action === "booking.save")!;
  await cmd(owner.id, tripId, "booking.save", cleanValues(formDefaults(b.form!.fields, b.form!.values)));
  expect((await prisma.booking.findFirstOrThrow({ where: { tripId } })).eventId).toBe(event.id);
  await cmd(owner.id, tripId, "event.status", { id: event.id, status: "HIDDEN", expectedStatus: "SAVED" });
  expect((await page(owner.id, "bookings", tripId)).blocks.some(b => b.title === event.title)).toBe(false);
  await cmd(owner.id, tripId, "event.status", { id: event.id, status: "NEW", expectedStatus: "HIDDEN" });
  expect((await page(owner.id, "events", tripId)).blocks.some(b => b.title === event.title)).toBe(true);
});

it("lets viewers chat and vote while protecting administrator tools", async () => {
  const owner = await makeUser("Owner"), viewer = await makeUser("Viewer"), tripId = await makeTrip(owner.id); await premium(tripId, owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  await cmd(viewer.id, tripId, "chat", { op: "send", clientId: randomUUID(), body: "Meet at the hotel" });
  expect((await page(owner.id, "chat", tripId)).blocks.some(b => b.text === "Meet at the hotel")).toBe(true);
  await cmd(owner.id, tripId, "poll.create", { question: "Which museum?", kind: "ACTIVITY", options: ["Art", "History"] });
  const polls = await page(viewer.id, "votes", tripId), action = polls.blocks[0].actions![0];
  await cmd(viewer.id, tripId, action.action!, action.values!);
  expect(await prisma.tripVote.count()).toBe(1);
  await expect(page(viewer.id, "admin")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(cmd(viewer.id, undefined, "trial.create", { email: "someone@example.test", durationDays: 14 })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("requires a dedicated admin unlock while permanent Premium remains active in Normal mode", async () => {
  const owner = await makeUser("Admin traveler", "company@example.test");
  await prisma.user.update({ where: { id: owner.id }, data: { emailVerified: true } });
  setTestRuntime({ ...currentRuntime(), companyAdminEmail: owner.email });
  const session = await adminAuthenticationFixture(owner.id), tripId = await makeTrip(owner.id);
  expect((await page(owner.id, "admin")).blocks.some(b => b.id === "summary")).toBe(true);
  await cmd(owner.id, undefined, "admin.mode", { mode: "NORMAL" });
  setTestRuntime({ ...currentRuntime(), accountMode: { userId: owner.id, sessionId: session.id, normal: true } });
  expect((await page(owner.id, "itinerary", tripId)).premium).toBe(true);
  expect((await page(owner.id, "admin")).blocks[0].id).toBe("security");
  await expect(cmd(owner.id, undefined, "admin.mode", { mode: "ADMIN" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.session.update({ where: { id: session.id }, data: { normalMode: false } });
  setTestRuntime({ ...currentRuntime(), accountMode: { userId: owner.id, sessionId: session.id, normal: false } });
  await prisma.session.update({ where: { id: session.id }, data: { adminVerifiedUntil: new Date(Date.now() - 1) } });
  expect((await page(owner.id, "admin")).blocks[0].id).toBe("security");
});

it("maintains nested form arrays, hidden versions and optional conversions without prototype mutation", () => {
  const initial = { version: 7, answers: [{ q: "Food?", a: [] }] };
  const next = setValue(initial, "answers.0.a", ["Local food"]);
  expect(getValue(next, "answers.0.a")).toEqual(["Local food"]); expect(initial.answers[0].a).toEqual([]);
  expect(cleanValues({ ...next, conversion: { currency: "", rate: "", rateDate: "" }, files: [], dayId: "" })).toEqual({ ...next, conversion: null, dayId: null });
  expect(setValue(initial, "__proto__.polluted", true)).toBe(initial);
  expect({}).not.toHaveProperty("polluted");
});

it("renders every customer screen as JSON with the appropriate role and entitlement", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id); await premium(tripId, owner.id);
  for (const screen of ["new", "trips", "account", "discovery", "notifications", "itinerary", "stop", "day", "plan", "versions", "expenses", "expense", "settlement", "chat", "locations", "assistant", "events", "event", "bookings", "booking", "packing", "settings", "sharing", "votes", "premium", "setup"]) {
    const doc = await page(owner.id, screen, ["new", "trips", "account", "discovery", "notifications"].includes(screen) ? undefined : tripId);
    expect(JSON.parse(JSON.stringify(doc)).title).toBeTruthy();
    expect(JSON.stringify(doc)).not.toContain("storageKey");
    expect(JSON.stringify(doc)).not.toContain("tokenHash");
  }
});

it("saves receipts through the mobile multipart endpoint and prevents unauthorized file access", async () => {
  const owner = await makeUser("Owner"), outsider = await makeUser("Outsider"), tripId = await makeTrip(owner.id); await premium(tripId, owner.id);
  const objects = new Map<string, Buffer>();
  setTestRuntime({ ...currentRuntime(), files: { put: async (key: string, bytes: Buffer) => { objects.set(key, Buffer.from(bytes)); }, get: async (key: string) => objects.has(key) ? { arrayBuffer: async () => Uint8Array.from(objects.get(key)!).buffer } : null, delete: async (key: string) => { objects.delete(key); } } as unknown as R2Bucket });
  const session = await prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: owner.id, expiresAt: new Date(Date.now() + 86400000) } });
  vi.mocked(getWorkerSession).mockResolvedValue({ user: owner, session });
  const travelers = await prisma.traveler.findMany({ where: { tripId } });
  const values = { id: null, version: 0, removeIds: [], description: "Taxi", category: "Transport", amount: "24", currency: "EUR", date: "2027-05-01", payerId: travelers[0].id, method: "EQUAL", participants: travelers.map(t => ({ travelerId: t.id })) };
  const form = new FormData(); form.set("op", "expense"); form.set("values", JSON.stringify(values)); form.append("files", new File(["%PDF-1.4\nfixture receipt"], "receipt.pdf", { type: "application/pdf" }));
  const response = await uploadFile(new Request(`https://www.tripanize.app/api/mobile/files?tripId=${tripId}`, { method: "POST", headers: { Origin: "tripanize://" }, body: form }));
  expect(response.status, await response.clone().text()).toBe(200);
  expect(objects.size).toBe(1);
  const attachment = await prisma.attachment.findFirstOrThrow({ where: { tripId } });
  const downloaded = await getFile(new Request(`https://www.tripanize.app/api/mobile/files?attachmentId=${attachment.id}`));
  expect(downloaded.status).toBe(200); expect(downloaded.headers.get("Content-Type")).toBe("application/pdf"); expect(downloaded.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await downloaded.text()).toContain("fixture receipt");
  vi.mocked(getWorkerSession).mockResolvedValue({ user: outsider, session: { ...session, userId: outsider.id } });
  const forbidden = await getFile(new Request(`https://www.tripanize.app/api/mobile/files?attachmentId=${attachment.id}`));
  expect(forbidden.status).toBe(404);
});

it("previews material trip changes before applying them", async () => {
  const owner = await makeUser("Owner"), tripId = await makeTrip(owner.id);
  const form = (await page(owner.id, "settings", tripId)).blocks.find(b => b.form?.action === "trip.update")!.form!;
  const values = cleanValues({ ...formDefaults(form.fields, form.values), endDate: "2027-05-02" });
  const preview = await cmd(owner.id, tripId, "trip.update", values);
  expect(preview.review?.lines.join(" ")).toContain("2027-05-04");
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).endDate).toBe("2027-05-04");
  await cmd(owner.id, tripId, preview.review!.action, preview.review!.values);
  expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId } })).endDate).toBe("2027-05-02");
});

it("requires fresh authentication and organizer transfer before account deletion", async () => {
  const owner = await makeUser("Owner"), member = await makeUser("Member"), tripId = await makeTrip(owner.id);
  await prisma.user.update({ where: { id: member.id }, data: { emailVerified: true } });
  const session = await prisma.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: member.id, expiresAt: new Date(Date.now() + 86400000) } });
  await prisma.tripMembership.create({ data: { tripId, userId: member.id, role: "COLLABORATOR" } });
  await expect(deleteMobileAccount(member.id, undefined, member.email, "DELETE")).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(deleteMobileAccount(member.id, session.id, "wrong@example.test", "DELETE")).rejects.toMatchObject({ code: "VALIDATION" });
  const ownTrip = await makeTrip(member.id);
  await expect(deleteMobileAccount(member.id, session.id, member.email, "DELETE")).rejects.toMatchObject({ code: "CONFLICT" });
  await prisma.trip.delete({ where: { id: ownTrip } });
  await deleteMobileAccount(member.id, session.id, member.email, "DELETE");
  expect(await prisma.user.findUnique({ where: { id: member.id } })).toBeNull();
  expect(await prisma.session.findUnique({ where: { id: session.id } })).toBeNull();
  expect(await prisma.trip.findUnique({ where: { id: tripId } })).not.toBeNull();
});

it("activates a 14-day invitation on an existing selected trip, without changing another trip or billing settings", async () => {
  const admin = await makeUser("Administrator", "admin@example.test"), recipient = await makeUser("Recipient", "recipient@example.test");
  await prisma.user.updateMany({ where: { id: { in: [admin.id, recipient.id] } }, data: { emailVerified: true } });
  setTestRuntime({ ...currentRuntime(), companyAdminEmail: admin.email }); await adminAuthenticationFixture(admin.id);
  await cmd(admin.id, undefined, "trial.create", { email: recipient.email, durationDays: 14 });
  const first = await makeTrip(recipient.id), second = await makeTrip(recipient.id);
  const document = await page(recipient.id, "trips"), invitation = document.blocks.find(b => b.form?.action === "trial.accept")!.form!;
  const values = { ...formDefaults(invitation.fields, invitation.values), tripId: first, name: "" };
  await cmd(recipient.id, undefined, "trial.accept", values);
  expect((await page(recipient.id, "itinerary", first)).premium).toBe(true);
  expect((await page(recipient.id, "itinerary", second)).premium).toBe(false);
  const trial = await prisma.trialInvitation.findFirstOrThrow({ where: { acceptedById: recipient.id } });
  expect(trial.tripId).toBe(first); expect(trial.trialEndsAt!.getTime() - trial.acceptedAt!.getTime()).toBe(14 * 86400000);
  expect(await prisma.premiumCheckout.count()).toBe(0);
});

it("lets viewers manage personal event alerts without granting shared discovery editing", async () => {
  const owner = await makeUser("Owner"), viewer = await makeUser("Viewer"), tripId = await makeTrip(owner.id); await premium(tripId, owner.id);
  await prisma.user.update({ where: { id: viewer.id }, data: { emailVerified: true } });
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const doc = await page(viewer.id, "events", tripId);
  expect(doc.blocks.some(b => b.form?.action === "events.alerts")).toBe(true);
  expect(doc.blocks.some(b => b.form?.action === "events.settings")).toBe(false);
  await cmd(viewer.id, tripId, "events.alerts", { emailEnabled: true, frequency: "daily", changeTypes: ["new"] });
  expect(await prisma.notificationPreference.findUnique({ where: { userId_tripId: { userId: viewer.id, tripId } } })).toMatchObject({ emailEnabled: true, frequency: "daily" });
  await expect(cmd(viewer.id, tripId, "events.settings", { autoDiscovery: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("provides the reference-style trip layout without mixing days, plans or viewer permissions", async () => {
  const owner = await makeUser("Layout owner"), viewer = await makeUser("Layout viewer"), outsider = await makeUser("Layout outsider");
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.create({ data: { tripId, userId: viewer.id, role: "VIEWER" } });
  const days = await prisma.itineraryDay.findMany({ where: { tripId }, orderBy: { date: "asc" } });
  await cmd(owner.id, tripId, "stop.save", { dayId: days[0].id, plan: "A", title: "Morning river walk", startTime: "09:00", durationMin: 60, locationName: "Riverside", category: "sight" });
  await cmd(owner.id, tripId, "stop.save", { dayId: days[0].id, plan: "B", title: "Rainy day museum", startTime: "10:00", durationMin: 90 });
  await cmd(owner.id, tripId, "stop.save", { dayId: days[1].id, plan: "A", title: "Another day only" });
  const restaurant = { name: "Test café", cuisine: "French breakfast", area: "Old town", address: "1 Test Street", whyFits: "Before the morning walk", pricePerPerson: 15, officialUrl: "https://example.test/cafe", sourceUrls: ["https://example.test/cafe"], hoursNote: "Opens at 07:00" };
  await prisma.itineraryDay.update({ where: { id: days[0].id }, data: { title: "A relaxed first day", area: "Old town", isTravelDay: true, driveMinutes: 165, estCostMinor: 9450, mealOptions: { breakfast: [restaurant, { ...restaurant, name: "Second café" }], lunch: [], dinner: [] } } });
  const doc = await page(owner.id, "itinerary", tripId, days[0].id);
  expect(doc.trip).toMatchObject({ name: "Lisbon long weekend", destinations: ["Lisbon"], startDate: "2027-05-01" });
  expect(doc.itinerary?.days).toHaveLength(4);
  expect(doc.itinerary?.selectedDay).toMatchObject({ id: days[0].id, title: "A relaxed first day", activePlan: "A", travelMinutes: 165 });
  expect(doc.itinerary?.selectedDay?.estimatedCost).toContain("94.50");
  expect(doc.itinerary?.checklist).toHaveLength(6);
  expect(doc.blocks.filter(b => b.stop).map(b => b.title)).toEqual(["Morning river walk"]);
  expect(doc.blocks.find(b => b.stop)?.stop).toMatchObject({ time: "09:00", durationMin: 60, place: "Riverside" });
  expect(doc.blocks.filter(b => b.restaurant).map(b => b.restaurant?.name)).toEqual(["Test café", "Second café"]);
  expect(doc.blocks.find(b => b.restaurant)?.actions?.map(a => a.label)).toEqual(["Directions", "Website", "Source"]);
  // Legacy blocks remain available to the installed 0.2.2 client.
  expect(doc.blocks.find(b => b.id === "days")?.actions).toHaveLength(4);
  const readonly = await page(viewer.id, "itinerary", tripId, days[0].id);
  expect(readonly.itinerary?.selectedDay?.planActions).toEqual([]);
  expect(readonly.blocks.find(b => b.stop)?.actions?.some(a => a.label === "Edit")).toBe(false);
  expect(readonly.blocks.find(b => b.id === "tools")?.actions?.some(a => a.to?.screen === "plan")).toBe(false);
  await cmd(owner.id, tripId, "day.plan", { id: days[0].id, plan: "B" });
  const alternative = await page(owner.id, "itinerary", tripId, days[0].id);
  expect(alternative.itinerary?.selectedDay?.activePlan).toBe("B");
  expect(alternative.blocks.filter(b => b.stop).map(b => b.title)).toEqual(["Rainy day museum"]);
  await expect(page(outsider.id, "itinerary", tripId, days[0].id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

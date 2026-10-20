import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { listTrips, getTripHeader, updateTrip, deleteTrip } from "@/server/trips/service";
import { addStop, getItinerary } from "@/server/itinerary/service";
import { createExpense, getExpenseData } from "@/server/expenses/service";
import { createBooking } from "@/server/bookings/service";
import { acceptInvitation, createInvitation, previewInvitation, revokeInvitation, removeMember, changeRole } from "@/server/invitations/service";
import { addPackingItem, getPacking, updatePackingItem, removePackingItem, refreshSuggestions } from "@/server/packing/service";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("trip membership boundaries", () => {
  it("non-members cannot see or touch a trip, and it does not appear in their dashboard", async () => {
    const owner = await makeUser("Ana");
    const stranger = await makeUser("Eve");
    const tripId = await makeTrip(owner.id);
    expect((await listTrips(owner.id)).map((t) => t.id)).toEqual([tripId]);
    expect(await listTrips(stranger.id)).toEqual([]);
    await expect(getTripHeader(stranger.id, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getItinerary(stranger.id, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addStop(stranger.id, tripId, { dayId: null, input: { title: "x" } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getExpenseData(stranger.id, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("invitations and roles", () => {
  it("viewer can read but not edit; collaborator can edit but not manage", async () => {
    const owner = await makeUser("Ana");
    const viewer = await makeUser("Vic");
    const collab = await makeUser("Cal");
    const tripId = await makeTrip(owner.id);
    const v = await createInvitation(owner.id, tripId, { role: "VIEWER" });
    const c = await createInvitation(owner.id, tripId, { role: "COLLABORATOR" });
    await acceptInvitation(viewer.id, v.url.split("/invite/")[1]);
    await acceptInvitation(collab.id, c.url.split("/invite/")[1]);

    await expect(getItinerary(viewer.id, tripId)).resolves.toBeTruthy();
    await expect(addStop(viewer.id, tripId, { dayId: null, input: { title: "Idea" } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createBooking(viewer.id, tripId, { title: "Hotel", category: "ACCOMMODATION", status: "IDEA", currency: "EUR" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(addStop(collab.id, tripId, { dayId: null, input: { title: "Idea" } })).resolves.toBeTruthy();
    await expect(createInvitation(collab.id, tripId, { role: "VIEWER" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    await expect(deleteTrip(collab.id, tripId, trip.name)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateTrip(viewer.id, tripId, { name: "Hacked", destinations: [] }, trip.version)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await changeRole(owner.id, tripId, viewer.id, "COLLABORATOR");
    await expect(addStop(viewer.id, tripId, { dayId: null, input: { title: "Now allowed" } })).resolves.toBeTruthy();
  });

  it("invitation links are single-use, expire, can be revoked, and email-bound links reject other accounts", async () => {
    const owner = await makeUser("Ana");
    const a = await makeUser("Bea", "bea@example.test");
    const b = await makeUser("Bob", "bob@example.test");
    const tripId = await makeTrip(owner.id);

    const inv = await createInvitation(owner.id, tripId, { role: "COLLABORATOR" });
    const token = inv.url.split("/invite/")[1];
    expect(token.length).toBeGreaterThanOrEqual(43); // 256-bit token
    await acceptInvitation(a.id, token);
    await expect(acceptInvitation(b.id, token)).rejects.toMatchObject({ code: "CONFLICT" });

    const bound = await createInvitation(owner.id, tripId, { role: "VIEWER", email: "carol@example.test" });
    await expect(acceptInvitation(b.id, bound.url.split("/invite/")[1])).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(bound.emailStatus).toBe("not_configured");

    const revoked = await createInvitation(owner.id, tripId, { role: "VIEWER" });
    await revokeInvitation(owner.id, tripId, revoked.id);
    expect((await previewInvitation(revoked.url.split("/invite/")[1])).ok).toBe(false);
    await expect(acceptInvitation(b.id, revoked.url.split("/invite/")[1])).rejects.toMatchObject({ code: "NOT_FOUND" });

    const expired = await createInvitation(owner.id, tripId, { role: "VIEWER" });
    await prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptInvitation(b.id, expired.url.split("/invite/")[1])).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("linking a planned traveler preserves their expense history without duplicating identities", async () => {
    const owner = await makeUser("Ana");
    const ben = await makeUser("Benjamin");
    const tripId = await makeTrip(owner.id); // creates planned traveler "Ben"
    const travelers = await prisma.traveler.findMany({ where: { tripId } });
    const anaT = travelers.find((t) => t.userId === owner.id)!;
    const benT = travelers.find((t) => t.name === "Ben")!;
    await createExpense(owner.id, tripId, { description: "Dinner", category: "Food & drink", amount: "60", currency: "EUR", date: "2027-05-01", payerId: anaT.id, method: "EQUAL", participants: [{ travelerId: anaT.id }, { travelerId: benT.id }] });

    const inv = await createInvitation(owner.id, tripId, { role: "COLLABORATOR", travelerId: benT.id });
    await acceptInvitation(ben.id, inv.url.split("/invite/")[1]);
    const after = await prisma.traveler.findMany({ where: { tripId } });
    expect(after).toHaveLength(2);
    expect(after.find((t) => t.id === benT.id)!.userId).toBe(ben.id);
    const data = await getExpenseData(ben.id, tripId);
    expect(data.ledger[0].people.find((p) => p.travelerId === benT.id)!.balance).toBe(-3000);

    // Leaving keeps history; rejoining re-links the same identity.
    await removeMember(ben.id, tripId, ben.id);
    await expect(getTripHeader(ben.id, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await prisma.expenseShare.count({ where: { travelerId: benT.id } }))).toBe(1);
    const again = await createInvitation(owner.id, tripId, { role: "VIEWER" });
    await acceptInvitation(ben.id, again.url.split("/invite/")[1]);
    expect(await prisma.traveler.count({ where: { tripId } })).toBe(2);
  });
});

describe("personal packing lists", () => {
  it("are private to their owner, while the shared list follows trip roles", async () => {
    const owner = await makeUser("Ana");
    const viewer = await makeUser("Vic");
    const tripId = await makeTrip(owner.id);
    const inv = await createInvitation(owner.id, tripId, { role: "VIEWER" });
    await acceptInvitation(viewer.id, inv.url.split("/invite/")[1]);

    const mine = await addPackingItem(owner.id, tripId, { label: "Camera", category: "Tech", shared: false });
    const shared = await addPackingItem(owner.id, tripId, { label: "First-aid kit", category: "Health", shared: true });
    const vic = await addPackingItem(viewer.id, tripId, { label: "Book", category: "Misc", shared: false });

    const vView = await getPacking(viewer.id, tripId);
    expect(vView.personal.map((i) => i.label)).toEqual(["Book"]);
    expect(vView.shared.map((i) => i.label)).toEqual(["First-aid kit"]);
    await expect(updatePackingItem(viewer.id, tripId, mine.id, { packed: true }, mine.version)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updatePackingItem(viewer.id, tripId, shared.id, { packed: true }, shared.version)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addPackingItem(viewer.id, tripId, { label: "Tent", category: "Gear", shared: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updatePackingItem(viewer.id, tripId, vic.id, { packed: true }, vic.version);
    await expect(updatePackingItem(owner.id, tripId, vic.id, { packed: false }, vic.version + 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refreshing suggestions keeps personal additions, checkmarks, and removed suggestions removed; no duplicates", async () => {
    const owner = await makeUser("Ana");
    const tripId = await makeTrip(owner.id);
    await refreshSuggestions(owner.id, tripId, { laundry: null });
    let p = await getPacking(owner.id, tripId);
    const count1 = p.personal.length + p.shared.length;
    expect(count1).toBeGreaterThan(5);
    const charger = p.personal.find((i) => i.label === "Phone charger")!;
    await updatePackingItem(owner.id, tripId, charger.id, { packed: true }, charger.version);
    const passport = p.personal.find((i) => i.label.startsWith("Passport"))!;
    await removePackingItem(owner.id, tripId, passport.id);
    await addPackingItem(owner.id, tripId, { label: "Kindle", category: "Tech", shared: false });
    await expect(addPackingItem(owner.id, tripId, { label: "phone chargers", category: "Tech", shared: false })).rejects.toMatchObject({ code: "VALIDATION" });

    await refreshSuggestions(owner.id, tripId, { laundry: null });
    p = await getPacking(owner.id, tripId);
    expect(p.personal.find((i) => i.label === "Phone charger")!.packed).toBe(true);
    expect(p.personal.some((i) => i.label.startsWith("Passport"))).toBe(false);
    expect(p.personal.some((i) => i.label === "Kindle")).toBe(true);
    expect(p.personal.length + p.shared.length).toBe(count1); // -1 removed +1 added
  });
});

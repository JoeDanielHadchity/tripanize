import { beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { currentRuntime, setTestRuntime } from "@/server/cloudflare/runtime";
import { createPoll, castVote, decidePoll, listPolls } from "@/server/voting/service";
import { makeTrip, makeUser, resetDb } from "./helpers";
beforeEach(async () => { await resetDb(); setTestRuntime({ ...currentRuntime(), planAccessEnabled: true, companyAdminEmail: undefined }); });
async function fixture() {
  const owner = await makeUser("Owner"), editor = await makeUser("Editor"), viewer = await makeUser("Viewer"), outsider = await makeUser("Outsider");
  const tripId = await makeTrip(owner.id);
  await prisma.tripMembership.createMany({ data: [{ tripId, userId: editor.id, role: "COLLABORATOR" }, { tripId, userId: viewer.id, role: "VIEWER" }] });
  const poll = await createPoll(owner.id, tripId, { question: "Where shall we go?", kind: "DESTINATION", options: ["Lisbon", "Barcelona", "Nice"] });
  const p = (await listPolls(owner.id, tripId)).polls[0];
  return { owner, editor, viewer, outsider, tripId, poll, p };
}
it("lets Normal trip members and viewers cast exactly one vote, change it, withdraw and retry safely", async () => {
  const { viewer, editor, tripId, p } = await fixture();
  const n = await prisma.tripNotification.count({ where: { tripId } });
  await castVote(viewer.id, tripId, p.id, p.options[0].id, p.version);
  await castVote(viewer.id, tripId, p.id, p.options[0].id, p.version);
  expect(await prisma.tripVote.count()).toBe(1);
  expect(await prisma.tripNotification.count({ where: { tripId } })).toBe(n + 2);
  await castVote(viewer.id, tripId, p.id, p.options[1].id, p.version);
  await castVote(editor.id, tripId, p.id, p.options[1].id, p.version);
  let list = await listPolls(viewer.id, tripId); expect(list.premium).toBe(false); expect(list.canCreate).toBe(false); expect(list.polls[0]).toMatchObject({ totalVotes: 2, myOptionId: p.options[1].id }); expect(list.polls[0].options[1].count).toBe(2);
  expect(JSON.stringify(list.polls)).not.toContain(viewer.email);
  await castVote(viewer.id, tripId, p.id, null, p.version); expect((await listPolls(viewer.id, tripId)).polls[0].totalVotes).toBe(1);
});
it("keeps final decisions organizer-only, leaves itinerary untouched, and can undo/reopen with votes retained", async () => {
  const { owner, editor, viewer, tripId, p } = await fixture();
  await castVote(viewer.id, tripId, p.id, p.options[0].id, p.version);
  await expect(decidePoll(editor.id, tripId, p.id, "DECIDE", p.options[1].id, null, p.version)).rejects.toMatchObject({ code: "FORBIDDEN" });
  const destinations = await prisma.destination.findMany({ where: { tripId } });
  await decidePoll(owner.id, tripId, p.id, "DECIDE", p.options[1].id, "Better flights for everyone", p.version);
  let row = (await listPolls(viewer.id, tripId)).polls[0]; expect(row).toMatchObject({ status: "DECIDED", chosenOptionId: p.options[1].id, totalVotes: 1 });
  await expect(castVote(viewer.id, tripId, p.id, p.options[1].id, row.version)).rejects.toMatchObject({ code: "CONFLICT" });
  expect(await prisma.destination.findMany({ where: { tripId } })).toEqual(destinations);
  await decidePoll(owner.id, tripId, p.id, "REOPEN", null, null, row.version);
  row = (await listPolls(viewer.id, tripId)).polls[0]; expect(row).toMatchObject({ status: "OPEN", chosenOptionId: null, totalVotes: 1, decisionNote: null });
  await expect(decidePoll(owner.id, tripId, p.id, "ARCHIVE", null, null, p.version)).rejects.toMatchObject({ code: "CONFLICT" });
  await decidePoll(owner.id, tripId, p.id, "ARCHIVE", null, null, row.version); expect((await listPolls(owner.id, tripId)).polls[0].status).toBe("ARCHIVED");
});
it("rejects nonmembers, cross-trip choices, viewers creating votes, duplicate options, and votes after suspension", async () => {
  const { owner, viewer, outsider, tripId, p } = await fixture();
  await expect(listPolls(outsider.id, tripId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(castVote(outsider.id, tripId, p.id, p.options[0].id, p.version)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(createPoll(viewer.id, tripId, { question: "Test?", kind: "ACTIVITY", options: ["A", "B"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(createPoll(owner.id, tripId, { question: "Test?", kind: "ACTIVITY", options: ["Nice", " nice "] })).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(castVote(viewer.id, tripId, p.id, "another-polls-option", p.version)).rejects.toMatchObject({ code: "VALIDATION" });
  const otherTrip = await makeTrip(outsider.id);
  await expect(castVote(outsider.id, otherTrip, p.id, p.options[0].id, p.version)).rejects.toMatchObject({ code: "NOT_FOUND" });
  await prisma.user.update({ where: { id: viewer.id }, data: { suspendedAt: new Date() } });
  await expect(castVote(viewer.id, tripId, p.id, p.options[0].id, p.version)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("excludes former members from vote totals and cascades trip deletion", async () => {
  const { owner, viewer, tripId, p } = await fixture();
  await castVote(viewer.id, tripId, p.id, p.options[0].id, p.version);
  await prisma.tripMembership.delete({ where: { tripId_userId: { tripId, userId: viewer.id } } });
  expect((await listPolls(owner.id, tripId)).polls[0].totalVotes).toBe(0);
  await prisma.trip.delete({ where: { id: tripId } }); expect(await prisma.tripVote.count()).toBe(0); expect(await prisma.tripPoll.count()).toBe(0);
});

it("offers only the signed-in creator's saved destination ideas without sharing search preferences", async () => {
  const { owner, editor, viewer, tripId } = await fixture();
  await prisma.destinationSearch.create({ data: { userId: owner.id, number: 1, input: { constraints: "Private preference" }, status: "SUCCEEDED", result: { ideas: [{ destination: "Porto", country: "Portugal" }] } } });
  await prisma.destinationSearch.create({ data: { userId: editor.id, number: 1, input: {}, status: "SUCCEEDED", result: { ideas: [{ destination: "Kyoto", country: "Japan" }] } } });
  const o = await listPolls(owner.id, tripId), e = await listPolls(editor.id, tripId), v = await listPolls(viewer.id, tripId);
  expect(o.suggestions.DESTINATION).toContain("Porto, Portugal"); expect(o.suggestions.DESTINATION).not.toContain("Kyoto, Japan");
  expect(e.suggestions.DESTINATION).toContain("Kyoto, Japan"); expect(v.suggestions.DESTINATION).not.toContain("Porto, Portugal");
  expect(JSON.stringify(o)).not.toContain("Private preference");
});

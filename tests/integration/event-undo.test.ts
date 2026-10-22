import { beforeEach, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { addCustomEvent, scheduleEvent, setEventStatus } from "@/server/events/service";
import { makeTrip, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
it("restores the prior event status and refuses undo over a subsequent change", async () => {
  const owner = await makeUser("Ana");
  const tripId = await makeTrip(owner.id);
  const event = await addCustomEvent(owner.id, tripId, { title: "Jazz night" });
  await setEventStatus(owner.id, tripId, event.id, "HIDDEN", "SAVED");
  await setEventStatus(owner.id, tripId, event.id, "SAVED", "HIDDEN");
  expect((await prisma.tripEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("SAVED");
  await setEventStatus(owner.id, tripId, event.id, "NEW", "SAVED");
  await expect(setEventStatus(owner.id, tripId, event.id, "SAVED", "HIDDEN")).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await prisma.tripEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("NEW");
  const day = await prisma.itineraryDay.findFirstOrThrow({ where: { tripId } });
  await scheduleEvent(owner.id, tripId, event.id, day.id, "19:00", 60);
  await expect(setEventStatus(owner.id, tripId, event.id, "NEW", "SAVED")).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await prisma.tripEvent.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("SCHEDULED");
});

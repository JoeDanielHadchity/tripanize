import { z } from "zod";
import { PlanStopSchema } from "@/server/planner/schema";
import { ASSISTANT_MAX_MESSAGE } from "@/lib/trip-assistant";

const date = z.string();
const ref = z.string();
const plan = z.enum(["A", "B"]);
export const AssistantEditSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("swap_days"), date, otherDate: date }),
  z.object({ type: z.literal("move_stop"), stopId: ref, date: date.nullable(), plan, startTime: z.string().nullable() }),
  z.object({ type: z.literal("edit_stop"), stopId: ref, startTime: z.string().nullable(), durationMin: z.number().int().nullable(), notes: z.string().nullable() }),
  z.object({ type: z.literal("replace_stop"), stopId: ref, stop: PlanStopSchema }),
  z.object({ type: z.literal("add_stop"), date, plan, stop: PlanStopSchema }),
  z.object({ type: z.literal("remove_stop"), stopId: ref }),
  z.object({ type: z.literal("edit_day"), date, title: z.string().nullable(), notes: z.string().nullable(), activePlan: plan.nullable() }),
]);
export const AssistantResponseSchema = z.object({
  reply: z.string().describe("A concise, friendly reply in the user's language. Describe proposed changes, never claim they are already saved. Ask a question if the request is ambiguous."),
  edits: z.array(AssistantEditSchema).max(30).describe("Only the changes explicitly requested by the traveler. Empty for questions, clarification or unsupported changes. Never modify bookings, fixed commitments or chosen events."),
});
export type AssistantEdit = z.infer<typeof AssistantEditSchema>;
export type AssistantResponse = z.infer<typeof AssistantResponseSchema>;
export const assistantCommand = z.discriminatedUnion("op", [
  z.object({ op: z.literal("send"), clientId: z.string().uuid(), message: z.string().trim().min(1).max(ASSISTANT_MAX_MESSAGE), selectedDate: z.string().max(10).nullable() }).strict(),
  z.object({ op: z.literal("apply"), id: z.string().max(64) }).strict(),
  z.object({ op: z.literal("dismiss"), id: z.string().max(64) }).strict(),
  z.object({ op: z.literal("cancel"), id: z.string().max(64) }).strict(),
]);
export type AssistantParams = { membershipId: string; clientId: string; message: string; selectedDate: string | null };

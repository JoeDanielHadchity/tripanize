import { z } from "zod";
import { mobileWrite } from "@/server/mobile/api";
import { beginStorePurchase, completeInput, completeStorePurchase } from "@/server/billing/store";

const begin = z.object({ op: z.literal("begin"), tripId: z.string().min(1).max(64), store: z.enum(["google_play", "app_store"]) });
/** Native in-app purchases: create a server intent, then verify the store's receipt. */
export async function POST(request: Request) {
  return mobileWrite(request, async (userId, input) => {
    const op = (input as { op?: unknown } | null)?.op;
    if (op === "begin") { const d = begin.parse(input); return beginStorePurchase(userId, d.tripId, d.store); }
    const { op: _op, ...rest } = z.object({ op: z.literal("complete") }).passthrough().parse(input);
    return completeStorePurchase(userId, completeInput.parse(rest));
  });
}

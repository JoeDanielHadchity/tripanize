// Prints the strict JSON schema sent to OpenAI for the planner, to verify it is valid for structured outputs.
import { zodTextFormat } from "openai/helpers/zod";
import { ProposalSchema, EventsSchema, SwapSchema } from "../src/server/planner/schema";

for (const [name, s] of [["trip_plan", ProposalSchema], ["events", EventsSchema], ["swap", SwapSchema]] as const) {
  const f = zodTextFormat(s, name) as unknown as { type: string; strict: boolean; schema: Record<string, unknown> };
  const bad: string[] = [];
  const walk = (node: unknown, p: string) => {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "object") {
      const props = Object.keys((n.properties as object) ?? {});
      const req = (n.required as string[]) ?? [];
      if (n.additionalProperties !== false) bad.push(`${p}: additionalProperties not false`);
      for (const k of props) if (!req.includes(k)) bad.push(`${p}.${k}: not required`);
    }
    for (const [k, v] of Object.entries(n)) walk(v, `${p}/${k}`);
  };
  walk(f.schema, name);
  console.log(name, f.type, "strict=", f.strict, bad.length ? bad : "OK");
}

// Sends one minimal request through the real planner client and prints the classified outcome.
import { generateStructured, AIError } from "../src/server/ai/openai";
import { SwapSchema } from "../src/server/planner/schema";
const t = Date.now();
try {
  const r = await generateStructured({ schema: SwapSchema, name: "swap", instructions: "Return one alternative to the Louvre.", input: "Paris", webSearch: false, timeoutMs: 20000, maxOutputTokens: 2000 });
  console.log("OK", r.model, JSON.stringify(r.data).slice(0, 200));
} catch (e) {
  console.log(e instanceof AIError ? `${e.code}: ${e.message}` : e, `(${Date.now() - t} ms)`);
}

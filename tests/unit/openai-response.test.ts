import { currentRuntime } from "@/server/cloudflare/runtime";
const runtime = currentRuntime();
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
const key = process.env.OPENAI_API_KEY;
beforeEach(async () => { vi.resetModules(); const { setTestRuntime } = await import("@/server/cloudflare/runtime"); setTestRuntime(runtime); process.env.OPENAI_API_KEY = "isolated-sdk-fixture"; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key; });
function response(output: unknown[], extra = {}) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "resp_fixture", object: "response", model: "isolated", status: "completed", output, usage: null, ...extra }), { headers: { "Content-Type": "application/json" } })));
}
function message(text: string, phase?: string) { return { id: "msg_fixture", type: "message", status: "completed", role: "assistant", ...(phase ? { phase } : {}), content: [{ type: "output_text", text, annotations: [] }] }; }
async function generate() { const { generateStructured } = await import("@/server/ai/openai"); return generateStructured({ name: "sdk_fixture", schema: z.object({ ready: z.boolean() }), instructions: "Return structured JSON", input: "Synthetic test", webSearch: true }); }
it("parses the final structured answer after real SDK concatenates search-progress commentary", async () => {
  response([message("I'll research suitable places first.", "commentary"), { id: "search_fixture", type: "web_search_call", status: "completed", action: { type: "search", query: "test", sources: [{ type: "url", url: "https://example.test/source" }] } }, message('{"ready":true}', "final_answer")]);
  const result = await generate(); expect(result.data).toEqual({ ready: true }); expect(result.sources).toEqual(["https://example.test/source"]);
});
it("supports final messages without a phase and ignores preceding commentary", async () => {
  response([message("Searching…", "commentary"), message('{"ready":true}')]);
  expect((await generate()).data.ready).toBe(true);
});
it("never mistakes commentary-only JSON for a final answer", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  response([message('{"ready":true}', "commentary")]); await expect(generate()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("rejects incomplete output even if its final JSON parses", async () => {
  response([message('{"ready":true}', "final_answer")], { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } });
  await expect(generate()).rejects.toMatchObject({ code: "INCOMPLETE" });
});
it("validates the final answer's schema and preserves refusal handling", async () => {
  response([message('{"ready":"wrong type"}', "final_answer")]); await expect(generate()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
});
it("accepts researched destination copy through the SDK before applying display limits", async () => {
  const { fixtureIdeas } = await import("../fixtures/destinations");
  const { discoveryWireResult, normalizeDiscoveryResult } = await import("@/server/destinations/schema");
  const data = fixtureIdeas(); data.ideas[0].weather = "Seasonal weather detail. ".repeat(35);
  response([message("Researching the destination options.", "commentary"), message(JSON.stringify(data), "final_answer")]);
  const { generateStructured } = await import("@/server/ai/openai");
  const raw = await generateStructured({ name: "destination_ideas", schema: discoveryWireResult, instructions: "Synthetic destination fixture", input: "Test", webSearch: true });
  const result = normalizeDiscoveryResult(raw.data);
  expect(result.ideas).toHaveLength(5); expect(result.ideas[0].weather.length).toBeLessThanOrEqual(400);
});
it("sends receipt image/PDF inputs through the SDK without search or provider response storage", async () => {
  response([message('{"ready":true}', "final_answer")]);
  const { generateStructured } = await import("@/server/ai/openai");
  await generateStructured({ name: "receipt_sdk_fixture", schema: z.object({ ready: z.boolean() }), instructions: "Synthetic extraction", input: "Read one receipt", content: [{ role: "user", content: [{ type: "input_text", text: "Read one receipt" }, { type: "input_image", image_url: "data:image/png;base64,ZmFrZQ==", detail: "high" }, { type: "input_file", filename: "receipt.pdf", file_data: "data:application/pdf;base64,ZmFrZQ==" }] }], webSearch: false });
  const call = vi.mocked(fetch).mock.calls[0];
  const body = JSON.parse(String(call[1]?.body));
  expect(body.store).toBe(false); expect(body.tools).toBeUndefined(); expect(body.input[0].content[1].type).toBe("input_image"); expect(body.input[0].content[2].type).toBe("input_file");
});

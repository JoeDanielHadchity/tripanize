import { afterEach, expect, it, vi } from "vitest";
import { aiModel } from "@/server/ai/openai";
afterEach(() => vi.unstubAllEnvs());

it("uses Terra for research and planning and Luna for the small jobs by default", () => {
  vi.stubEnv("OPENAI_MODEL", ""); vi.stubEnv("OPENAI_LIGHT_MODEL", "");
  for (const task of ["trip_plan", "trip_restaurants", "events", "destination_ideas", "swap", "trip_assistant"]) expect(aiModel(task)).toBe("gpt-6.1-terra");
  for (const task of ["plan_questions", "receipt_scan", "trip_packing"]) expect(aiModel(task)).toBe("gpt-6-luna");
});
it("follows the configured models, and a single configured model covers everything", () => {
  vi.stubEnv("OPENAI_MODEL", "gpt-6.1-sol"); vi.stubEnv("OPENAI_LIGHT_MODEL", "gpt-6-luna");
  expect(aiModel("trip_plan")).toBe("gpt-6.1-sol"); expect(aiModel("receipt_scan")).toBe("gpt-6-luna");
  vi.stubEnv("OPENAI_LIGHT_MODEL", "");
  expect(aiModel("receipt_scan")).toBe("gpt-6.1-sol");
});

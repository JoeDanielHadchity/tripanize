import { describe, expect, it } from "vitest";
import { fingerprint, scrub } from "@/server/errors/reports";

describe("error reports", () => {
  it("hides emails, tokens and query values", () => {
    expect(scrub("Failed for joe@example.com")).toBe("Failed for [email]");
    expect(scrub("GET /api/x?q=abc&b=2")).toBe("GET /api/x?q=…&b=…");
    expect(scrub("Bearer abc.def")).toBe("Bearer [hidden]");
    expect(scrub(`id ${"a".repeat(40)}`)).toBe("id [id]");
  });
  it("groups the same bug together", () => {
    const stack = "TypeError: x\n    at render (https://www.tripanize.app/_next/a.js:1:2345)";
    expect(fingerprint("web", "Trip 123 not found", stack)).toBe(fingerprint("web", "Trip 456 not found", stack.replace("2345", "99")));
    expect(fingerprint("web", 'Cannot read "name"', stack)).toBe(fingerprint("web", 'Cannot read "title"', stack));
    expect(fingerprint("web", "A", stack)).not.toBe(fingerprint("app", "A", stack));
    expect(fingerprint("web", "A", stack)).not.toBe(fingerprint("web", "B", stack));
  });
});

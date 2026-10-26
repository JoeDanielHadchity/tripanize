import { describe, expect, it } from "vitest";
import { invitationOrigin, invitationRedirect } from "@/lib/invitation-urls";

describe("invitation hosts", () => {
  it("uses www in production and preserves configured preview origins", () => {
    expect(invitationOrigin("https://tripanize.app/")).toBe("https://www.tripanize.app");
    expect(invitationOrigin("https://www.tripanize.app/")).toBe("https://www.tripanize.app");
    expect(invitationOrigin("http://localhost:3000/")).toBe("http://localhost:3000");
    expect(invitationOrigin("https://tripanize.example.test/")).toBe("https://tripanize.example.test");
  });

  it.each(["invite", "trial"])("redirects old %s links without changing the token or query", kind => {
    const path = `/${kind}/AbCd_-0123?from=email&next=%2Ftrips`;
    for (const method of ["GET", "HEAD"]) {
      const redirect = invitationRedirect(new Request(`https://tripanize.app${path}`, { method }));
      expect(redirect?.status).toBe(307);
      expect(redirect?.headers.get("Location")).toBe(`https://www.tripanize.app${path}`);
      expect(redirect?.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("does not redirect server actions, API calls, unrelated pages, or other hosts", () => {
    expect(invitationRedirect(new Request("https://tripanize.app/invite/token", { method: "POST" }))).toBeNull();
    for (const url of [
      "https://www.tripanize.app/invite/token",
      "https://tripanize.app.example.test/invite/token",
      "http://localhost:3000/invite/token",
      "https://tripanize.app/trips",
      "https://tripanize.app/api/invitations",
      "https://tripanize.app/trial?invitation=token",
    ]) expect(invitationRedirect(new Request(url))).toBeNull();
  });
});

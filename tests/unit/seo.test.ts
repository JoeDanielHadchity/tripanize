import { describe, expect, it } from "vitest";
import { publicCanonicalRedirect, SITE_ORIGIN } from "@/lib/seo";
import sitemap from "@/app/sitemap";

describe("public SEO routing", () => {
  it("consolidates anonymous public pages without losing campaign parameters", () => {
    for (const method of ["GET", "HEAD"]) {
      for (const path of ["/", "/plans", "/privacy", "/examples/lisbon-porto", "/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"]) {
        const response = publicCanonicalRedirect(new Request(`https://tripanize.app${path}?utm_source=launch`, { method }));
        expect(response?.status).toBe(308);
        expect(response?.headers.get("Location")).toBe(`${SITE_ORIGIN}${path}?utm_source=launch`);
        expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
        expect(response?.headers.get("Vary")).toBe("Cookie");
      }
    }
  });

  it("preserves existing sessions on their original host", () => {
    for (const name of ["better-auth.session_token", "__Secure-better-auth.session_token", "__Host-better-auth.session_token", "__Secure-better-auth.session_data.0"]) {
      expect(publicCanonicalRedirect(new Request("https://tripanize.app/plans", { headers: { Cookie: `theme=light; ${name}=existing-session` } }))).toBeNull();
    }
    expect(publicCanonicalRedirect(new Request("https://tripanize.app/", { headers: { Cookie: "theme=light" } }))?.status).toBe(308);
  });

  it("leaves authentication, payments, private routes and other hosts alone", () => {
    expect(publicCanonicalRedirect(new Request("https://tripanize.app/plans", { method: "POST" }))).toBeNull();
    for (const path of ["/api/auth/callback", "/api/paddle/webhook", "/trips", "/trips/private-id", "/account", "/checkout", "/sign-in", "/invite/token", "/trial/token", "/mobile-preview/trips"]) {
      expect(publicCanonicalRedirect(new Request(`https://tripanize.app${path}`))).toBeNull();
    }
    for (const origin of [SITE_ORIGIN, "http://localhost:3000", "https://tripanize.app.example.test"]) {
      expect(publicCanonicalRedirect(new Request(`${origin}/`))).toBeNull();
    }
  });

  it("publishes only canonical public pages and the curated example", () => {
    const urls = sitemap().map(entry => entry.url);
    expect(urls).toContain(`${SITE_ORIGIN}/`);
    expect(urls).toContain(`${SITE_ORIGIN}/plans`);
    expect(urls).toContain(`${SITE_ORIGIN}/examples/lisbon-porto`);
    for (const path of ["/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"]) expect(urls).toContain(SITE_ORIGIN + path);
    expect(new Set(urls).size).toBe(urls.length);
    for (const value of urls) {
      const url = new URL(value);
      expect(url.origin).toBe(SITE_ORIGIN);
      expect(url.search).toBe("");
      expect(url.pathname).not.toMatch(/^\/(?:api|trips|account|company|checkout|invite|trial|destinations|mobile-preview|sign-in|sign-up)(?:\/|$)/);
    }
  });
});

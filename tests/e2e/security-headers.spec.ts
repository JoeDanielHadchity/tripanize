import { expect, test } from "@playwright/test";

// Pages carry the security headers, and the content policy doesn't block anything the site itself uses.
test("pages have security headers and no blocked content", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", m => { if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text()); });
  for (const path of ["/", "/privacy", "/sign-in", "/plans"]) {
    const response = await page.goto(path);
    const headers = response!.headers();
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"], path).toContain("max-age=31536000");
    await page.waitForLoadState("networkidle");
  }
  const api = await page.request.get("/api/mobile/auth-options");
  expect(api.headers()["content-security-policy"]).toBeUndefined();
  expect(blocked).toEqual([]);
});

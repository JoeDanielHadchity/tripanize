import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdminSecurity } from "@/app/account/security/security";
const initial = { email: "admin@example.test", unlocked: false, verifiedUntil: null, codeSent: false, expiresAt: null, resendAt: null, lockedUntil: null };
it("offers email verification with no enrollment or QR setup", () => {
  const html = renderToStaticMarkup(createElement(AdminSecurity, { initial }));
  expect(html).toContain("Send code to my email"); expect(html).toContain("admin@example.test");
  expect(html).not.toContain("otpauth:"); expect(html).not.toContain('name="code"'); expect(html).not.toContain("Set up authenticator");
});
it("shows the email-code form when delivery was accepted", () => {
  const html = renderToStaticMarkup(createElement(AdminSecurity, { initial: { ...initial, codeSent: true, expiresAt: new Date(Date.now() + 600_000).toISOString() } }));
  expect(html).toContain('name="code"'); expect(html).toMatch(/autocomplete="one-time-code"/i); expect(html).toContain("Verify &amp; open Admin");
});

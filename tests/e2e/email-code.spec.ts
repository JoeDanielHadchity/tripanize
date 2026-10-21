import { expect, test } from "@playwright/test";

// Passwordless sign-in by email code. Runs against scripts/resend-stub.mjs (the app started with
// RESEND_API_KEY set and RESEND_API_URL pointing at the stub): this checks Tripanize's code flow and the request
// it sends to Resend's API, not delivery by Resend itself.
test.skip(!process.env.E2E_RESEND_STUB, "Requires the app to run against scripts/resend-stub.mjs");
const STUB = process.env.E2E_RESEND_STUB ?? "";

async function lastCode(to: string) {
  const r = await fetch(`${STUB}/last?to=${encodeURIComponent(to)}`);
  expect(r.ok).toBeTruthy();
  const m = (await r.json()) as { subject: string; text: string; from: string };
  const code = m.text.match(/\b(\d{6})\b/)?.[1];
  expect(code, "email contains a 6-digit code").toBeTruthy();
  expect(m.subject).toContain(code!);
  return code!;
}

test("new and returning users sign in with an emailed code", async ({ page, browser }, info) => {
  const email = `code-${info.project.name}-${Date.now()}@example.test`;
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(page.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible();

  // A wrong code is rejected without signing in.
  await page.getByLabel("Sign-in code").fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("That code isn't right")).toBeVisible();

  await page.getByLabel("Sign-in code").fill(await lastCode(email));
  await page.getByLabel("Your name").fill("Rita");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/trips");
  await expect(page.getByRole("link", { name: "Rita" })).toBeVisible();

  // Returning user, fresh browser: same email, new code, same account.
  const ctx = await browser.newContext();
  const again = await ctx.newPage();
  await again.goto("/sign-in");
  await again.getByLabel("Email").fill(email.toUpperCase());
  await again.getByRole("button", { name: "Email me a sign-in code" }).click();
  await expect(again.getByLabel("Sign-in code")).toBeVisible();
  await again.getByLabel("Sign-in code").fill(await lastCode(email));
  await again.getByRole("button", { name: "Sign in", exact: true }).click();
  await again.waitForURL("**/trips");
  await expect(again.getByRole("link", { name: "Rita" })).toBeVisible();
  await ctx.close();
});

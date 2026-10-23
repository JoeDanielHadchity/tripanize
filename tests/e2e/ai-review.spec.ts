import { expect, test } from "@playwright/test";

// Review/accept/version/swap UI using the TEST-ONLY OpenAI stub (scripts/openai-stub.mjs). This verifies Tripanize's
// handling of a structured AI response — it does NOT verify a real ChatGPT request.
test.skip(!process.env.E2E_AI_STUB, "Requires the worker to run against scripts/openai-stub.mjs");

test("AI draft review: accept selected days, version history, AI swap", async ({ page }, info) => {
  const run = `${info.project.name}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Ana");
  await page.getByLabel("Email").fill(`stub-${run}@example.test`);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/trips");
  await page.goto("/trips/new");
  await page.getByLabel("Trip name").fill("Stub trip");
  await page.getByLabel("Start date").fill("2027-05-01");
  await page.getByLabel("End date").fill("2027-05-03");
  await page.getByLabel("City or region").fill("Lisbon");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.waitForURL("**/premium?created=1");
  const tripUrl = page.url().replace(/\/premium.*$/, "");

  await page.goto(`${tripUrl}/plan`);
  await page.getByRole("button", { name: /Plan with AI$/ }).click();
  await expect(page.getByRole("heading", { name: "Review the draft" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Stub day 1")).toBeVisible();
  // Accept only days 1 and 2
  await page.getByRole("checkbox", { name: "Accept day" }).nth(2).uncheck();
  await page.getByRole("button", { name: "Accept 2 selected days" }).click();
  await page.waitForURL("**/itinerary");
  await expect(page.getByRole("heading", { name: "Stub museum 1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stub museum 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stub museum 3" })).toHaveCount(0);
  await expect(page.getByText("Suggestion").first()).toBeVisible();
  if (process.env.E2E_SHOTS_DIR) await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/${info.project.name}-13-ai-applied.png`, fullPage: true });

  // AI swap
  await page.getByRole("group", { name: "Actions for Stub museum 1" }).getByRole("button", { name: "Swap" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Find alternatives" }).click();
  await expect(dlg.getByText("Stub alternative A")).toBeVisible({ timeout: 60_000 });
  await dlg.getByRole("button", { name: "Use this — review impact" }).first().click();
  await dlg.getByRole("button", { name: "Swap stop" }).click();
  await expect(page.getByRole("heading", { name: "Stub alternative A" })).toBeVisible();

  // Undo via versions
  await page.getByRole("button", { name: /Versions/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore" }).first().click();
  await page.getByRole("dialog", { name: "Restore this version?" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Version restored")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stub museum 1" })).toHaveCount(0);
  void tripUrl;
});

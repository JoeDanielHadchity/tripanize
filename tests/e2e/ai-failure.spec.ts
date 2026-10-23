import { expect, test } from "@playwright/test";

// Exercises the real job pipeline (UI → persisted job → worker → OpenAI client) when OpenAI can't be reached.
// Run with the server and worker started with an OPENAI_API_KEY but no network route to api.openai.com.
test.skip(!process.env.E2E_AI_UNREACHABLE, "Only meaningful when OpenAI is configured but unreachable");

test("Plan with AI failure keeps the itinerary and reports the real reason", async ({ page }, info) => {
  const run = `${info.project.name}-${Date.now()}`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Ana");
  await page.getByLabel("Email").fill(`ai-${run}@example.test`);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/start");
  await page.goto("/trips/new");
  await page.getByLabel("Trip name").fill("AI failure trip");
  await page.getByRole("button", { name: "Create trip & choose plan" }).click();
  await page.waitForURL("**/premium?created=1");
  const tripUrl = page.url().split("/premium")[0];
  await page.getByRole("button", { name: "Choose Normal · $0" }).click();
  await page.waitForURL("**/onboarding");
  await page.getByLabel("Start date").fill("2027-05-01");
  await page.getByLabel("End date").fill("2027-05-02");
  await page.getByLabel("City or region").fill("Lisbon");
  await page.getByRole("button", { name: "Continue to travel questions" }).click();

  // Existing manual plan
  await page.goto(`${tripUrl}/itinerary`);
  await page.getByRole("button", { name: "+ Idea" }).click();
  await page.getByRole("dialog").getByLabel("Title").fill("My saved idea");
  await page.getByRole("dialog").getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My saved idea" })).toBeVisible();

  await page.goto(`${tripUrl}/plan`);
  const btn = page.getByRole("button", { name: /Plan with AI$/ });
  await expect(btn).toBeEnabled();
  await btn.dblclick(); // duplicate clicks must not create two jobs
  await expect(page.getByText(/Planning stopped/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/could not reach OpenAI/).first()).toBeVisible();
  await expect(page.getByText(/Collected trip details/)).toBeVisible();
  if (process.env.E2E_SHOTS_DIR) await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/${info.project.name}-12-ai-failure.png`, fullPage: true });
  await page.reload();
  await expect(page.getByText("Recent planning runs")).toBeVisible();
  await expect(page.locator("li", { hasText: "Whole trip" })).toHaveCount(1);

  await page.goto(`${tripUrl}/itinerary`);
  await expect(page.getByRole("heading", { name: "My saved idea" })).toBeVisible();
});

import { expect, test } from "@playwright/test";

// Trip dates picked on the calendar: first tap = start, second tap = end; the typed date fields stay in sync.
test("pick trip dates on the calendar", async ({ browser }, info) => {
  const mobile = Boolean(info.project.use.isMobile);
  const ctx = await browser.newContext({ viewport: info.project.use.viewport ?? undefined, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Cal");
  await page.getByLabel("Email").fill(`cal-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/start");
  await page.goto("/trips/new");

  await page.getByLabel("Trip name").fill("Calendar trip");
  await page.getByRole("button", { name: "Continue to plans" }).click();
  await page.waitForURL("**/premium?created=1");
  const tripUrl = page.url().split("/premium")[0];
  await page.getByRole("button", { name: "Continue free" }).click();
  await page.waitForURL("**/onboarding");

  // Two months ahead, the 10th to the 13th.
  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "Next month" }).click();
  const now = new Date();
  const target = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 2, 1));
  const ym = target.toISOString().slice(0, 7);
  // Match "10 December 2026" inside the label; weekday punctuation differs between ICU versions.
  const name = (day: number) => new RegExp(`\\b${day} ${new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(target)} ${target.getUTCFullYear()}`);

  await page.getByRole("button", { name: name(10) }).first().click();
  await expect(page.getByText("now tap the last day")).toBeVisible();
  await page.getByRole("button", { name: name(13) }).first().click();
  await expect(page.getByLabel("Start date")).toHaveValue(`${ym}-10`);
  await expect(page.getByLabel("End date")).toHaveValue(`${ym}-13`);
  await expect(page.getByText("· 4 days")).toBeVisible();
  await expect(page.getByRole("button", { name: /trip start/ })).toHaveAttribute("aria-pressed", "true");

  // Tapping a day before the start restarts the range; Clear empties it.
  await page.getByRole("button", { name: name(5) }).first().click();
  await expect(page.getByLabel("Start date")).toHaveValue(`${ym}-05`);
  await expect(page.getByLabel("End date")).toHaveValue("");
  await page.getByRole("button", { name: name(8) }).first().click();
  await expect(page.getByLabel("End date")).toHaveValue(`${ym}-08`);

  await page.getByLabel("Trip name").fill("Calendar trip");
  await page.getByLabel("City or region").fill("Lisbon");
  await page.getByRole("button", { name: "Continue to travel questions" }).click();
  await page.goto(`${tripUrl}/itinerary`);
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("link")).toHaveCount(4);
  await ctx.close();
});

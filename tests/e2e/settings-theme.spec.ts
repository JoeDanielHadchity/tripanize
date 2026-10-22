import { expect, test } from "@playwright/test";

// Settings → Appearance: System / Light / Dark, applied instantly, remembered on the device, no flash on reload.
const bg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = "rgb(250, 247, 241)";
const DARK = "rgb(18, 26, 43)";

test("appearance setting switches and remembers light/dark mode", async ({ browser }, info) => {
  const mobile = Boolean(info.project.use.isMobile);
  const ctx = await browser.newContext({ viewport: info.project.use.viewport ?? undefined, isMobile: mobile, hasTouch: mobile, colorScheme: "dark" });
  const page = await ctx.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Theo");
  await page.getByLabel("Email").fill(`theme-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/trips");
  expect(await bg(page)).toBe(DARK); // System default follows the (dark) device

  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/settings");
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /System/ })).toBeChecked();

  await page.getByText("Light", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await bg(page)).toBe(LIGHT);
  await page.reload();
  await expect(page.getByRole("radio", { name: /Light/ })).toBeChecked();
  expect(await bg(page)).toBe(LIGHT);
  await page.goto("/trips");
  expect(await bg(page)).toBe(LIGHT);

  await page.goto("/settings");
  await page.getByText("Dark", { exact: true }).click();
  expect(await bg(page)).toBe(DARK);
  await page.getByText("System", { exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await bg(page)).toBe(DARK);
  await ctx.close();
});

test("signed-out visitors can open settings from the homepage", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/settings");
  await page.getByText("Dark", { exact: true }).click();
  expect(await bg(page)).toBe(DARK);
  await page.goto("/");
  expect(await bg(page)).toBe(DARK);
});

import { expect, test } from "@playwright/test";

// Every new document starts light. Explicit choices last during client-side browsing.
const bg = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = "rgb(246, 242, 233)";
const DARK = "rgb(25, 30, 36)";

test("appearance starts light and allows dark or system until the next reload", async ({ browser }, info) => {
  const mobile = Boolean(info.project.use.isMobile);
  const ctx = await browser.newContext({ viewport: info.project.use.viewport ?? undefined, isMobile: mobile, hasTouch: mobile, colorScheme: "dark" });
  await ctx.addInitScript(() => localStorage.setItem("tripanize-theme", "dark")); // Ignore legacy saved preferences.
  const page = await ctx.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Theo");
  await page.getByLabel("Email").fill(`theme-${info.project.name}-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/start");
  expect(await bg(page)).toBe(LIGHT); // Light even on a dark device with an old saved preference.

  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/settings");
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Light/ })).toBeChecked();

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
  await page.getByRole("link", { name: "My trips", exact: true }).click();
  await page.waitForURL("**/trips");
  expect(await bg(page)).toBe(DARK);
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/settings");
  await expect(page.getByRole("radio", { name: /Dark/ })).toBeChecked();
  await page.getByText("System", { exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
  expect(await bg(page)).toBe(DARK);
  await page.reload();
  await expect(page.getByRole("radio", { name: /Light/ })).toBeChecked();
  expect(await bg(page)).toBe(LIGHT);
  await ctx.close();
});

test("signed-out visitors can open settings from the homepage", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/settings");
  await page.getByText("Dark", { exact: true }).click();
  expect(await bg(page)).toBe(DARK);
  await page.getByRole("link", { name: "Tripanize home" }).click();
  await page.waitForURL("/");
  expect(await bg(page)).toBe(DARK);
  const newTab = await page.context().newPage();
  await newTab.goto("/");
  expect(await bg(newTab)).toBe(LIGHT);
  expect(await bg(page)).toBe(DARK);
  await newTab.close();
  await page.reload();
  expect(await bg(page)).toBe(LIGHT);
});

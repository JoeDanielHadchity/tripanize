import { expect, test, type Browser } from "@playwright/test";

// Pre-planning questions (standard set, as OPENAI_API_KEY is absent here), the itinerary day strip, and
// accepting an email invitation from the trips page without a link.

async function signUp(browser: Browser, name: string, email: string, isMobile: boolean, viewport: { width: number; height: number } | null) {
  const ctx = await browser.newContext({ viewport: viewport ?? undefined, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/start");
  await page.getByRole("link", { name: "I have a destination", exact: true }).click();
  await page.waitForURL("**/trips");
  return page;
}

test("preferences, day strip and home-screen invitations", async ({ browser }, info) => {
  const run = `${info.project.name}-${Date.now()}`;
  const mobile = Boolean(info.project.use.isMobile);
  const vp = info.project.use.viewport ?? null;
  const ana = await signUp(browser, "Ana", `ana-p-${run}@example.test`, mobile, vp);

  await ana.getByRole("link", { name: "+ Plan a new trip" }).click();
  await ana.getByLabel("Trip name").fill(`Porto ${run}`);
  await ana.getByRole("button", { name: "Continue to plans" }).click();
  await ana.waitForURL("**/premium?created=1");
  const tripUrl = ana.url().split("/premium")[0];
  await ana.getByRole("button", { name: "Continue free" }).click();
  await ana.waitForURL("**/onboarding");
  await ana.getByLabel("Start date").fill("2027-06-10");
  await ana.getByLabel("End date").fill("2027-06-13");
  await ana.getByLabel("City or region").fill("Porto");
  await ana.getByRole("button", { name: "Continue to travel questions" }).click();

  await ana.goto(`${tripUrl}/plan`);

  // Questions
  await ana.getByRole("button", { name: "Answer questions" }).click();
  await expect(ana.getByText("How full should your days be?")).toBeVisible();
  await ana.getByRole("button", { name: "Slow and relaxed" }).click();
  await ana.getByRole("button", { name: "Food and markets" }).click();
  await ana.getByRole("button", { name: "Nature and hiking" }).click();
  await ana.getByRole("button", { name: "Save answers" }).click();
  await expect(ana.getByText("Food and markets, Nature and hiking")).toBeVisible();
  await ana.reload();
  await expect(ana.getByText("Slow and relaxed")).toBeVisible();

  // Day strip
  await ana.goto(`${tripUrl}/itinerary`);
  const strip = ana.getByRole("navigation", { name: "Days" });
  await expect(strip.getByRole("link")).toHaveCount(4);
  await strip.getByRole("link", { name: /Day 3/ }).click();
  await expect(ana).toHaveURL(/#day-2027-06-12$/);
  await expect(strip.getByRole("link", { name: /Day 3/ })).toHaveAttribute("aria-current", "true");

  // Email invitation → accept from the trips page
  const ritaEmail = `rita-${run}@example.test`;
  await ana.goto(`${tripUrl}/settings`);
  await ana.getByLabel("Email (optional)").fill(ritaEmail);
  await ana.getByRole("button", { name: "Create invitation link" }).click();
  await expect(ana.getByLabel("Invitation link")).toBeVisible();

  const rita = await signUp(browser, "Rita", ritaEmail, mobile, vp);
  await expect(rita.getByText("You're invited")).toBeVisible();
  await expect(rita.getByText(`Porto ${run}`)).toBeVisible();
  await rita.getByRole("button", { name: "Join", exact: true }).click();
  await rita.waitForURL(`**${new URL(tripUrl).pathname}`);
  await rita.goto("/trips");
  await expect(rita.getByText("You're invited")).toHaveCount(0);
  await expect(rita.getByRole("link", { name: new RegExp(`Porto ${run}`) }).first()).toBeVisible();
});

import type { Page } from "@playwright/test";

// Create a trip is one question per screen (src/lib/trip-wizard.ts): Where, When, Who, Style, Budget,
// Getting there, Must-sees, Food, Ready. Optional steps are passed with Next.
export const nextStep = (page: Page) => page.getByRole("button", { name: /^Next/ }).click();

export type TripSteps = { name?: string; timezone?: string; mustSee?: string };

/** From the Who step to the trip being created. */
export async function finishTrip(page: Page, o: TripSteps = {}) {
  await nextStep(page); // Who
  await nextStep(page); // Travel style
  await nextStep(page); // Budget
  if (o.timezone) await page.getByLabel("Time zone (optional)").fill(o.timezone);
  await nextStep(page); // Getting there & staying
  if (o.mustSee) { await page.getByLabel("Must-see places").fill(o.mustSee); await page.getByLabel("Must-see places").press("Enter"); }
  await nextStep(page); // Must-see places
  await nextStep(page); // Food & needs
  if (o.name) await page.getByLabel("Trip name").fill(o.name);
  await page.getByRole("button", { name: /^Create (trial )?trip$/ }).click();
}

/** On /trips/new: the whole flow with typed dates. */
export async function createTrip(page: Page, o: TripSteps & { city: string; start: string; end: string }) {
  await page.getByLabel("City or region").fill(o.city);
  await nextStep(page);
  await page.getByLabel("Start date").fill(o.start);
  await page.getByLabel("End date").fill(o.end);
  await nextStep(page);
  await finishTrip(page, o);
}

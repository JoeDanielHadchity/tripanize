import { expect, test, type Browser, type Page } from "@playwright/test";

// End-to-end core flow with two separate accounts. Runs against a live server + worker + Postgres.
// The AI step verifies the honest "not configured" state when OPENAI_API_KEY is absent (as in CI/sandbox).

const shots = process.env.E2E_SHOTS_DIR;
async function shot(page: Page, name: string, project: string) {
  if (shots) await page.screenshot({ path: `${shots}/${project}-${name}.png`, fullPage: true });
}

function isoDate(offsetDays: number) {
  // "Today" in Europe/Lisbon, shifted.
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const d = new Date(`${parts}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function signUp(browser: Browser, name: string, email: string, viewport: { width: number; height: number } | null, isMobile: boolean, next?: string) {
  const ctx = await browser.newContext({ viewport: viewport ?? undefined, isMobile, hasTouch: isMobile });
  const page = await ctx.newPage();
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-test-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(next ? `**${next}` : "**/trips");
  return page;
}

test("core flow: plan, edit, invite, share, split, settle, today, events", async ({ browser }, info) => {
  const project = info.project.name;
  const vp = info.project.use.viewport ?? null;
  const mobile = Boolean(info.project.use.isMobile);
  const run = `${project}-${Date.now()}`;
  const today = isoDate(0);

  // 1. Account creation
  const ana = await signUp(browser, "Ana", `ana-${run}@example.test`, vp, mobile);
  await expect(ana.getByRole("heading", { name: "My trips" })).toBeVisible();
  await expect(ana.getByText("Where to next?")).toBeVisible();
  await expect(ana.getByText("Example", { exact: true })).toBeVisible();
  await shot(ana, "01-dashboard-empty", project);

  // 2. Trip setup
  await ana.getByRole("link", { name: "+ Plan a new trip" }).click();
  await ana.getByLabel("Trip name").fill(`Lisbon ${run}`);
  await ana.getByRole("button", { name: "Create trip & choose plan" }).click();
  await ana.waitForURL("**/premium?created=1");
  const tripUrl = ana.url().split("/premium")[0];
  await expect(ana.getByRole("heading", { name: "Choose how you want to travel" })).toBeVisible();
  await ana.getByRole("button", { name: "Choose Normal · $0" }).click();
  await ana.waitForURL("**/onboarding");
  await ana.getByLabel("Start date").fill(isoDate(-1));
  await ana.getByLabel("End date").fill(isoDate(2));
  await ana.getByLabel("City or region").fill("Lisbon");
  await ana.getByText("Getting there & around").click();
  await ana.getByLabel("Time zone").fill("Europe/Lisbon");
  await ana.getByText("Places & commitments").click();
  await ana.getByLabel("Must-see places").fill("Belém Tower");
  await ana.getByLabel("Must-see places").press("Enter");
  await ana.getByRole("button", { name: "Continue to travel questions" }).click();

  // 3. Plan with AI — honest state without OPENAI_API_KEY
  await ana.goto(`${tripUrl}/plan?start=1`);
  await expect(ana.getByText("Your trip is created")).toBeVisible();
  await expect(ana.getByText("AI planning isn't available on this server yet")).toBeVisible();
  await expect(ana.getByRole("button", { name: /Plan with AI$/ })).toBeDisabled();
  await shot(ana, "03-plan-with-ai", project);

  // 6. Manual planning: add stops on today's date
  await ana.getByRole("link", { name: "Start planning manually" }).click();
  await ana.waitForURL("**/itinerary");
  const dayCard = ana.locator(`#day-${today}`);
  for (const [title, time, dur] of [["Café A Brasileira", "09:00", "45"], ["Jerónimos Monastery", "10:00", "90"], ["Lunch at Time Out Market", "12:30", "75"]] as const) {
    await dayCard.getByRole("button", { name: "Day options" }).click();
    await dayCard.getByRole("button", { name: /Add stop to Plan A/ }).click();
    const dlg = ana.getByRole("dialog");
    await dlg.getByLabel("Title").fill(title);
    await dlg.getByLabel("Start time").fill(time);
    await dlg.getByLabel("Duration (min)").fill(dur);
    await dlg.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dlg).toBeHidden();
    await expect(dayCard.getByRole("heading", { name: title })).toBeVisible();
  }
  // Keyboard-accessible reorder: move lunch earlier
  await dayCard.getByRole("button", { name: "Move Lunch at Time Out Market earlier" }).click();
  const reviewOrder = ana.getByRole("dialog", { name: "Review the new order" });
  await expect(reviewOrder.or(ana.getByText("Order updated"))).toBeVisible();
  if (await reviewOrder.isVisible()) {
    await expect(reviewOrder.getByText(/stop time\(s\) change/)).toBeVisible(); // impact summary of changed times
    await shot(ana, "04a-reorder-impact", project);
    await reviewOrder.getByRole("button", { name: "Apply new order" }).click();
  }
  await expect(ana.getByText("Order updated")).toBeVisible();
  await expect(dayCard.locator("h4")).toHaveText(["Café A Brasileira", "Lunch at Time Out Market", "Jerónimos Monastery"]);

  // Swap a stop (manual replacement because AI isn't configured) with impact review
  await dayCard.getByRole("group", { name: "Actions for Café A Brasileira" }).getByRole("button", { name: "Swap" }).click();
  const swap = ana.getByRole("dialog");
  await expect(swap.getByText(/isn't configured on this server/)).toBeVisible();
  await swap.getByLabel("Title").fill("Pastéis de Belém");
  await swap.getByRole("button", { name: "Review impact" }).click();
  await swap.getByRole("button", { name: "Swap stop" }).click();
  await expect(dayCard.getByRole("heading", { name: "Pastéis de Belém" })).toBeVisible();

  // Move a stop to unscheduled ideas
  await dayCard.getByRole("group", { name: "Actions for Jerónimos Monastery" }).getByRole("button", { name: "Move", exact: true }).click();
  const mv = ana.getByRole("dialog");
  await mv.getByLabel("Move to").selectOption({ label: "Unscheduled ideas (no date)" });
  await mv.getByRole("button", { name: "Review impact" }).click();
  await mv.getByRole("button", { name: "Move", exact: true }).click();
  await expect(ana.getByText("Moved to unscheduled ideas")).toBeVisible();
  await expect(dayCard.getByRole("heading", { name: "Jerónimos Monastery" })).toHaveCount(0);
  await expect(ana.locator("section", { has: ana.getByRole("heading", { name: "Unscheduled ideas" }) }).getByRole("heading", { name: "Jerónimos Monastery" })).toBeVisible();
  await shot(ana, "04-itinerary", project);

  // 7. Invite Ben (link connected to the planned traveler "Ben")
  await ana.goto(`${tripUrl}/settings`);
  await expect(ana.getByText("Others can't reach this server yet")).toBeVisible();
  await ana.getByLabel("Connect to traveler (optional)").selectOption({ label: "Ben" });
  await ana.getByRole("button", { name: "Create invitation link" }).click();
  const inviteUrl = await ana.getByLabel("Invitation link").inputValue();
  expect(inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  await shot(ana, "05-invite", project);

  const invitePath = new URL(inviteUrl).pathname;
  const ben = await signUp(browser, "Ben", `ben-${run}@example.test`, vp, mobile, invitePath);
  await expect(ben.getByRole("heading", { name: /Join “Lisbon/ })).toBeVisible();
  await ben.getByRole("button", { name: "Accept invitation" }).click();
  await ben.waitForURL("**/itinerary");
  await expect(ben.locator(`#day-${today}`).getByRole("heading", { name: "Pastéis de Belém" })).toBeVisible();
  // Reusing the same link must fail
  await ben.goto(invitePath);
  await expect(ben.getByText("This invitation has already been used.")).toBeVisible();

  // 8. Personal packing lists
  await ben.goto(`${tripUrl}/packing`);
  await ben.getByRole("button", { name: "Suggest a packing list" }).click();
  await expect(ben.getByText(/Added \d+ new suggestion/)).toBeVisible();
  await ben.getByLabel("Add to My packing list").fill("Ben's camera");
  await ben.getByRole("button", { name: "Add", exact: true }).first().click();
  await expect(ben.getByText("Ben's camera")).toBeVisible();
  await ben.getByLabel("Packed: Ben's camera").check();
  await shot(ben, "06-packing", project);
  await ana.goto(`${tripUrl}/packing`);
  await expect(ana.getByText("Ben's camera")).toHaveCount(0);

  // 9. Shared bookings — one canonical record
  await ana.goto(`${tripUrl}/bookings`);
  await ana.getByRole("button", { name: "+ Add booking" }).click();
  const bd = ana.getByRole("dialog");
  await bd.getByLabel("Title").fill("Tram 28 tour");
  await bd.getByLabel("Category").selectOption("EXPERIENCE");
  await bd.getByLabel("Status").selectOption("BOOKED");
  await bd.getByLabel("Date", { exact: true }).fill(today);
  await bd.getByLabel("Time").fill("15:00");
  await bd.getByLabel("Duration (min)").fill("90");
  await bd.getByRole("button", { name: "Save booking" }).click();
  await expect(ana.getByText("Booking added")).toBeVisible();
  await expect(ana.getByText("In itinerary")).toBeVisible();
  await shot(ana, "07-bookings", project);

  // 10/11. Expenses, split, and a partial repayment
  await ana.goto(`${tripUrl}/expenses`);
  await ana.getByRole("button", { name: "+ Add expense" }).click();
  const ed = ana.getByRole("dialog");
  await ed.getByLabel("Description").fill("Dinner in Alfama");
  await ed.getByLabel("Amount", { exact: true }).fill("90");
  await ed.getByRole("button", { name: "Save expense" }).click();
  await expect(ana.getByText("Expense added")).toBeVisible();
  await expect(ana.getByRole("row", { name: /Ben/ })).toContainText("owes €45.00");

  await ben.goto(`${tripUrl}/expenses`);
  await ben.getByRole("button", { name: "Settle up" }).click();
  const sd = ben.getByRole("dialog");
  await sd.getByLabel("Who paid back").selectOption({ label: "Ben" });
  await sd.getByLabel("To whom").selectOption({ label: "Ana" });
  await sd.getByLabel("Amount").fill("20");
  await sd.getByRole("button", { name: "Record repayment" }).click();
  await expect(ben.getByText("Repayment recorded")).toBeVisible();
  await expect(ben.getByRole("row", { name: /Ben/ })).toContainText("owes €25.00");
  await expect(ben.getByText("Total trip spending:")).toContainText("€90.00");
  await shot(ben, "08-expenses", project);

  // 12. Today (trip is in progress)
  await ben.goto(`${tripUrl}/today`);
  await expect(ben.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await expect(ben.getByRole("heading", { name: "Tram 28 tour" }).first()).toBeVisible();
  await expect(ben.getByText(/Booked/).first()).toBeVisible();
  await shot(ben, "09-today", project);

  // 13. Events: add own event, review conflicts, schedule it
  await ana.goto(`${tripUrl}/events`);
  await expect(ana.getByText(/Event discovery uses OpenAI/)).toBeVisible();
  await ana.getByRole("button", { name: "+ Add your own event" }).click();
  const evd = ana.getByRole("dialog");
  await evd.getByLabel("Title").fill("Fado at Clube de Fado");
  await evd.getByLabel("Date").fill(today);
  await evd.getByLabel("Time").fill("15:30");
  await evd.getByRole("button", { name: "Add event" }).click();
  await expect(ana.getByText("Event added to Saved")).toBeVisible();
  await ana.getByRole("button", { name: "Add to a day" }).click();
  const sch = ana.getByRole("dialog");
  await sch.getByRole("button", { name: "Check for conflicts" }).click();
  await expect(sch.getByText(/Tram 28 tour/)).toBeVisible(); // overlaps the booked tour
  await sch.getByRole("button", { name: /Add anyway|Add to day/ }).click();
  await expect(ana.getByText("Added to your itinerary")).toBeVisible();
  await shot(ana, "10-events", project);

  // 14. Persistence across sessions/devices: fresh context, sign in again
  const ctx3 = await browser.newContext({ viewport: vp ?? undefined, isMobile: mobile, hasTouch: mobile });
  const again = await ctx3.newPage();
  await again.goto("/sign-in");
  // With email delivery configured the page opens on code sign-in; switch to the password form.
  const pw = again.getByRole("button", { name: "Sign in with a password instead" });
  if (await pw.isVisible()) await pw.click();
  await again.getByLabel("Email").fill(`ana-${run}@example.test`);
  await again.getByLabel("Password").fill("a-long-test-password");
  await again.getByRole("button", { name: "Sign in" }).click();
  await again.waitForURL("**/trips");
  await expect(again.getByText("Happening now")).toBeVisible();
  await again.goto(`${tripUrl}/itinerary`);
  const d = again.locator(`#day-${today}`);
  await expect(d.getByRole("heading", { name: "Pastéis de Belém" })).toBeVisible();
  await expect(d.getByRole("heading", { name: "Tram 28 tour" })).toBeVisible();
  await expect(d.getByRole("heading", { name: "Fado at Clube de Fado" })).toBeVisible();
  await shot(again, "11-itinerary-after-signin", project);

  // Privacy: a third account can't open the trip
  const eve = await signUp(browser, "Eve", `eve-${run}@example.test`, vp, mobile);
  const res = await eve.goto(`${tripUrl}/itinerary`);
  expect(res?.status()).toBe(404);
});

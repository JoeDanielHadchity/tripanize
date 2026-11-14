import { expect, type Page } from "@playwright/test";

// Password sign-up now needs the 6-digit code emailed to the new account. The browser tests run the
// app against scripts/resend-stub.mjs (E2E_RESEND_STUB), which keeps the last email per address.
export async function lastCode(to: string) {
  const stub = process.env.E2E_RESEND_STUB;
  if (!stub) throw new Error("Set E2E_RESEND_STUB: password sign-up needs the emailed confirmation code.");
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${stub}/last?to=${encodeURIComponent(to.toLowerCase())}`);
    if (r.ok) {
      const code = ((await r.json()) as { text: string }).text.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise(res => setTimeout(res, 250));
  }
  throw new Error(`No code emailed to ${to}`);
}

/** Right after "Create account": enter the emailed code; the page then continues signed in. */
export async function confirmSignUp(page: Page) {
  const notice = page.getByText(/We sent a 6-digit code to /);
  await expect(notice).toBeVisible();
  const email = (await notice.textContent())!.match(/to (\S+?)\.\s/)![1];
  await page.getByLabel("Confirmation code").fill(await lastCode(email));
  await page.getByRole("button", { name: "Confirm email and continue" }).click();
}

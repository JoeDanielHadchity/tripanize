import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PremiumCheckout } from "@/components/premium-checkout";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/actions/onboarding", () => ({ chooseNormalAction: vi.fn() }));
vi.mock("@/app/actions/trials", () => ({ acceptTrialAction: vi.fn() }));

type Props = ComponentProps<typeof PremiumCheckout>;
const normal: Props["initial"] = {
  premium: false, preview: false, source: null, validUntil: null, people: 4,
  creditMinor: 0, capacity: 0, bandId: null, reviewRequired: false,
  onboardingStage: "PLAN", selectedFeatures: [], canPurchase: true,
  available: true, environment: "live", recommended: "premium",
  options: [{ id: "premium", label: "Any group size", capacity: Number.MAX_SAFE_INTEGER, priceMinor: 1500, eligible: true, dueMinor: 1500 }],
};
function render(overrides: Partial<Props["initial"]> = {}, trial?: Props["trial"]) {
  return renderToStaticMarkup(createElement(PremiumCheckout, { tripId: "fixture-trip", initial: { ...normal, ...overrides }, trial }));
}
function button(html: string, label: string) {
  const found = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[2].replace(/<[^>]*>/g, "") === label);
  expect(found, label).toBeDefined();
  return found![1];
}

it("lets an eligible organizer choose free access or open the one-trip checkout", () => {
  const html = render();
  expect(button(html, "Unlock Premium")).not.toMatch(/\sdisabled(?:=|\s|$)/);
  expect(button(html, "Continue free")).not.toMatch(/\sdisabled(?:=|\s|$)/);
  expect(html).toContain("$15");
  expect(html).toContain("One payment for the whole group.");
});

it("does not let a viewer or editor select a plan or pay", () => {
  const html = render({ canPurchase: false });
  expect(button(html, "Unlock Premium")).toMatch(/\sdisabled(?:=|\s|$)/);
  expect(button(html, "Continue free")).toMatch(/\sdisabled(?:=|\s|$)/);
  expect(html).toContain("Only the trip organizer");
});

it.each([{ available: false }, { reviewRequired: true }])("blocks a new purchase when checkout is unavailable or payment review is pending: %j", state => {
  const html = render(state);
  expect(button(html, "Unlock Premium")).toMatch(/\sdisabled(?:=|\s|$)/);
  expect(button(html, "Continue free")).not.toMatch(/\sdisabled(?:=|\s|$)/);
});

it("shows existing paid access without another purchase action", () => {
  const html = render({ premium: true, source: "purchase", creditMinor: 1500, onboardingStage: "COMPLETE" });
  expect(html).not.toContain("Unlock Premium");
  expect(html).toContain('href="/trips/fixture-trip"');
  expect(html).toContain("Premium active · open trip");
  expect(button(html, "Premium is already active")).toMatch(/\sdisabled(?:=|\s|$)/);
});

it("keeps the organizer's included all-access Premium free", () => {
  const html = render({ premium: true, source: "company" });
  expect(html).toContain("Included");
  expect(html).toContain("No payment required.");
  expect(html).not.toContain("Unlock Premium");
  expect(button(html, "Continue to trip questions")).not.toMatch(/\sdisabled(?:=|\s|$)/);
});

it("offers the invited organizer a 14-day zero-payment activation", () => {
  const html = render({}, { status: "available", invitationId: "fixture-invitation", durationDays: 14, acceptBy: "2026-12-31T00:00:00.000Z" });
  expect(html).toContain("$0");
  expect(html).toContain("No payment required.");
  expect(button(html, "Start 14-day Premium trial · $0")).not.toMatch(/\sdisabled(?:=|\s|$)/);
  expect(html).not.toContain("Unlock Premium");
});

it("keeps active trial members on their included access", () => {
  const html = render({ premium: true, source: "trial", canPurchase: false, validUntil: "2026-11-10T12:00:00.000Z", onboardingStage: "COMPLETE" });
  expect(html).toContain("Your one-trip trial is active");
  expect(html).toContain("10/11/2026");
  expect(html).toContain("No payment required.");
  expect(html).not.toContain("Unlock Premium");
});

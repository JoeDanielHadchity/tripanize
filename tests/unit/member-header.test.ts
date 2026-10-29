import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AppHeader } from "@/components/shell";

vi.mock("@/components/notifications", () => ({ NotificationBell: () => createElement("button", { "aria-label": "Notifications" }) }));
vi.mock("@/components/account-mode", () => ({ AccountModeSync: () => createElement("span", { "data-mode-sync": "true" }) }));

type Props = ComponentProps<typeof AppHeader>;
const member: Props["user"] = { id: "member", name: "Alex Traveler", email: "alex@example.test" };
function render(user: Props["user"] = member, current?: Props["current"]) {
  return renderToStaticMarkup(createElement(AppHeader, { user, current }));
}
function main(html: string) {
  return html.match(/<nav\b(?=[^>]*aria-label="Main")[^>]*>([\s\S]*?)<\/nav>/)![1];
}
function expectLinks(html: string) {
  const nav = main(html);
  const links = [...nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  expect(links.map(([, attrs]) => attrs.match(/href="([^"]+)"/)![1])).toEqual(["/", "/plans", "/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"]);
  expect(links.map(([, , label]) => label)).toEqual(["Home", "Plans", "Trip Planner", "Group Travel", "Expense splitter"]);
}

it("keeps the site links alongside a member's account controls", () => {
  const html = render();
  expectLinks(html);
  expect(html).toContain('aria-label="Account"');
  expect(html).toContain('href="/trips"');
  expect(html).toContain('href="/account"');
  expect(html).toContain('aria-label="Settings"');
  expect(html).toContain('aria-label="Notifications"');
  expect(html).toContain("Sign out");
  expect(html).not.toContain('href="/company"');
});

it("keeps the links in normal mode without showing locked admin controls", () => {
  const html = render({ ...member, companyAdminEligible: true, normalMode: true });
  expectLinks(html);
  expect(html).toContain("Normal mode · Premium included");
  expect(html).toContain('data-mode-sync="true"');
  expect(html).not.toContain('href="/company"');
});

it("preserves the unlocked administrator link", () => {
  const html = render({ ...member, companyAdminEligible: true, companyAdmin: true }, "admin");
  expectLinks(html);
  expect(html).toContain('href="/company"');
  expect(html).toContain('data-mode-sync="true"');
});

it("marks Home on the signed-in landing page", () => {
  expectLinks(render(member, "home"));
  expect(main(render(member, "home"))).toMatch(/<a\b(?=[^>]*href="\/")(?=[^>]*aria-current="page")[^>]*>Home<\/a>/);
  expect(main(render(member, "trips"))).not.toContain('aria-current="page"');
});

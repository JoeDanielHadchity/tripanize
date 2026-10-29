import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PublicHeader } from "@/components/public-header";
import { AppHeader } from "@/components/shell";

vi.mock("@/components/notifications", () => ({ NotificationBell: () => createElement("button", { "aria-label": "Notifications" }) }));
vi.mock("@/components/account-mode", () => ({ AccountModeSync: () => null }));

const user = { id: "member", name: "Alex Traveler", email: "alex@example.test" };

const destinations = ["/", "/plans", "/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"];

function links(html: string) {
  const main = html.match(/<nav\b(?=[^>]*aria-label="Main")[^>]*>([\s\S]*?)<\/nav>/)![1];
  return [...main.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(([, attributes, content]) => ({
    href: attributes.match(/href="([^"]+)"/)![1],
    active: attributes.includes('aria-current="page"'),
    text: content.replace(/<[^>]*>/g, ""),
  }));
}

it.each([...destinations, "/examples/paris", "/settings"])("keeps the same main links on %s with the current page indicated", currentPath => {
  const html = renderToStaticMarkup(createElement(PublicHeader, { currentPath }));
  const nav = links(html);
  expect(nav.slice(0, 5).map(link => link.href)).toEqual(destinations);
  expect(nav.slice(0, 5).map(link => link.text)).toEqual(["Home", "Plans", "Trip Planner", "Group Travel", "Expense splitter"]);
  expect(nav.filter(link => link.active).map(link => link.href)).toEqual(destinations.includes(currentPath) || currentPath === "/settings" ? [currentPath] : []);
  expect(html.match(/<nav/g)).toHaveLength(1);
});

it("keeps sign-in and trip creation available to visitors", () => {
  const nav = links(renderToStaticMarkup(createElement(PublicHeader)));
  expect(nav.find(link => link.text === "Sign in")?.href).toBe("/sign-in");
  expect(nav.find(link => link.text === "Create a trip")?.href).toBe("/sign-up");
});

it("keeps full account controls on signed-in public pages", () => {
  const html = renderToStaticMarkup(createElement(PublicHeader, { user }));
  expect(html).toContain('href="/trips"');
  expect(html).toContain('href="/account"');
  expect(html).toContain('aria-label="Notifications"');
  expect(html).toContain('aria-label="Settings"');
  expect(html).toContain("Sign out");
  expect(html).not.toContain('public-site-header');
  expect(html).not.toContain("Create a trip");
  expect(html).not.toContain("Sign in");
});

it.each(destinations)("uses the exact workspace header on the signed-in %s tab", currentPath => {
  const actual = renderToStaticMarkup(createElement(PublicHeader, { user, currentPath }));
  const expected = renderToStaticMarkup(createElement(AppHeader, { user, currentPath }));
  expect(actual.match(/<header[\s\S]*<\/header>/)?.[0]).toBe(expected.match(/<header[\s\S]*<\/header>/)?.[0]);
  expect(links(actual).filter(link => link.active).map(link => link.href)).toEqual([currentPath]);
});

it("preserves a guide's return URL when signing in", () => {
  const signInHref = "/sign-in?next=%2Fexamples%2Fparis%23use-itinerary";
  const nav = links(renderToStaticMarkup(createElement(PublicHeader, { signInHref })));
  expect(nav.find(link => link.text === "Sign in")?.href).toBe(signInHref);
});

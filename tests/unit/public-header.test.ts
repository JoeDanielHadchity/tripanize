import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PublicHeader } from "@/components/public-header";

const destinations = ["/", "/plans", "/ai-trip-planner", "/group-trip-planner", "/travel-expense-splitter"];

function links(html: string) {
  const main = html.match(/<nav aria-label="Main">([\s\S]*?)<\/nav>/)![1];
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
  expect(nav[0].text).toBe("Home");
  expect(nav.filter(link => link.active).map(link => link.href)).toEqual(destinations.includes(currentPath) || currentPath === "/settings" ? [currentPath] : []);
  expect(html.match(/<nav/g)).toHaveLength(1);
});

it("keeps sign-in and trip creation available to visitors", () => {
  const nav = links(renderToStaticMarkup(createElement(PublicHeader)));
  expect(nav.find(link => link.text === "Sign in")?.href).toBe("/sign-in");
  expect(nav.find(link => link.text === "Create a trip")?.href).toBe("/sign-up");
});

it("routes signed-in travelers to their trips and new trip form", () => {
  const nav = links(renderToStaticMarkup(createElement(PublicHeader, { authenticated: true })));
  expect(nav.find(link => link.text === "My trips")?.href).toBe("/trips");
  expect(nav.find(link => link.text === "Create a trip")?.href).toBe("/trips/new");
  expect(nav.some(link => link.text === "Sign in")).toBe(false);
});

it("preserves a guide's return URL when signing in", () => {
  const signInHref = "/sign-in?next=%2Fexamples%2Fparis%23use-itinerary";
  const nav = links(renderToStaticMarkup(createElement(PublicHeader, { signInHref })));
  expect(nav.find(link => link.text === "Sign in")?.href).toBe(signInHref);
});

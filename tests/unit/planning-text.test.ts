import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlanningText } from "@/components/planning-text";

it("renders readable planner source links, bold text and escaped HTML", () => {
  const html = renderToStaticMarkup(createElement(PlanningText, { text: "Visit **Grand Central** ([official site](https://grandcentralterminal.com/visit/?utm_source=openai)). <script>alert(1)</script>" }));
  expect(html).toContain("<strong>Grand Central</strong>");
  expect(html).toContain('href="https://grandcentralterminal.com/visit/?utm_source=openai"');
  expect(html).not.toContain("[official site]");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});

it("never makes non-web schemes or credential-bearing URLs clickable", () => {
  const html = renderToStaticMarkup(createElement(PlanningText, { text: "[click](javascript:alert(1)) [secret](https://user:pass@example.test) https://example.test/page." }));
  expect(html).not.toContain('href="javascript');
  expect(html).not.toContain('href="https://user:pass');
  expect(html).toContain('href="https://example.test/page"');
});

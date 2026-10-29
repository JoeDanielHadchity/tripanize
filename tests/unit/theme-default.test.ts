import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/components/announcements", () => ({ AnnouncementBanner: () => null }));
vi.mock("@/components/client", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => children,
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/offline", () => ({ OfflineBanner: () => null, ServiceWorker: () => null }));
vi.mock("@/components/legal-footer", () => ({ LegalFooter: () => null }));

import RootLayout, { viewport } from "@/app/layout";
import { AppearanceSetting } from "@/app/settings/appearance";

it("renders light mode before JavaScript without restoring a device preference", () => {
  const html = renderToStaticMarkup(createElement(RootLayout, { children: "Trip" }));
  expect(html).toContain('<html lang="en" data-theme="light">');
  expect(html).not.toContain("localStorage");
  expect(viewport.themeColor).toBe("#f6f2e9");
});

it("initially selects Light while keeping Dark and System available", () => {
  const html = renderToStaticMarkup(createElement(AppearanceSetting));
  expect(html).toMatch(/<input\b(?=[^>]*value="light")(?=[^>]*checked)[^>]*>/);
  expect(html).toContain('value="dark"');
  expect(html).toContain('value="system"');
  expect(html).toContain("Each fresh visit or reload starts in light mode.");
  expect(html).not.toContain("Saved on this device");
});

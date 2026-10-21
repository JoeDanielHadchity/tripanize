import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider, ConfirmProvider } from "@/components/client";
import { OfflineBanner, ServiceWorker } from "@/components/offline";

export const metadata: Metadata = {
  title: { default: "Tripanize — A little less planning. A lot more going.", template: "%s · Tripanize" },
  description: "Plan trips with AI, share them with your travel companions, and keep bookings, expenses and packing in one calm place.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1ea" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1714" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2">
          Skip to content
        </a>
        <ToastProvider>
          <ConfirmProvider>
            <OfflineBanner />
            {children}
          </ConfirmProvider>
        </ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}

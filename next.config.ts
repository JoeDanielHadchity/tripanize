import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  // Browsers only ever reach Tripanize over HTTPS (one year, subdomains included).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const pageHeaders = [
  // Which sites a page may load code, frames and connections from. Scripts: our own (inline ones are
  // Next's page data), Paddle checkout and Cloudflare's privacy-friendly analytics. Images may come from
  // any HTTPS site (trip cover photos). Nothing may frame Tripanize.
  { key: "Content-Security-Policy", value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.paddle.com https://*.paddle.com https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://cdn.paddle.com https://*.paddle.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.paddle.com https://*.paddle.net https://cloudflareinsights.com https://static.cloudflareinsights.com",
    "frame-src 'self' https://*.paddle.com https://*.paddle.net",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join("; ") },
];

const nextConfig: NextConfig = {
  async headers() {
    // The content policy is for pages; files and API answers (receipts and PDFs opened in the browser's
    // viewer) keep just the basic headers.
    return [{ source: "/:path*", headers: securityHeaders }, { source: "/((?!api/).*)", headers: pageHeaders }];
  },
};

export default nextConfig;

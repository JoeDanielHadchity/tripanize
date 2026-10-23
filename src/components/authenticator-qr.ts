"use client";
import { createElement } from "react";
import QRCodeExport from "react-qr-code";

// The published types describe an unwrapped default component, while native ESM
// and the production bundler can return the CommonJS module containing QRCode.
const QRCode = (QRCodeExport as typeof QRCodeExport & { QRCode?: typeof QRCodeExport }).QRCode ?? QRCodeExport;

/** The URI stays in the browser; no external QR service receives its secret. */
export function AuthenticatorQr({ uri }: { uri: string }) {
  return createElement(QRCode, { value: uri, size: 208, style: { maxWidth: "100%", height: "auto" }, title: "Scan with your authenticator app", role: "img", "aria-label": "Authenticator setup QR code" });
}

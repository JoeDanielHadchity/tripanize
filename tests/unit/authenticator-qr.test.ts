import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AuthenticatorQr } from "@/components/authenticator-qr";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

it("renders the setup QR as a real accessible SVG without printing the secret as text", () => {
  const uri = "otpauth://totp/Tripanize.app:fixture%40example.test?secret=JBSWY3DPEHPK3PXP&issuer=Tripanize.app&digits=6&period=30";
  const html = renderToStaticMarkup(createElement(AuthenticatorQr, { uri }));
  expect(html).toContain('<svg');
  expect(html).toContain('role="img"');
  expect(html).toContain('aria-label="Authenticator setup QR code"');
  expect(html).toContain('width="208"');
  expect(html.match(/<path /g)).toHaveLength(2);
  expect(html).not.toContain(uri);
  expect(html).not.toContain("JBSWY3DPEHPK3PXP");
  expect(html).not.toContain("<img");
});

it("also renders under native ESM/CommonJS interop used by the production bundle", () => {
  // Vitest's dependency interop unwraps this package differently. Render the
  // actual component in native ESM as well so that discrepancy cannot hide a crash.
  const source = readFileSync(new URL("../../src/components/authenticator-qr.ts", import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const resolved = js.replace(/from (["'])(react(?:-qr-code)?)\1/g, (_match, _quote, name: string) => `from ${JSON.stringify(import.meta.resolve(name))}`);
  const script = `import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const { AuthenticatorQr } = await import(${JSON.stringify(`data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`)});
const html = renderToStaticMarkup(createElement(AuthenticatorQr, {uri:'otpauth://totp/Fixture?secret=JBSWY3DPEHPK3PXP&issuer=Tripanize.app'}));
process.stdout.write(String(html.startsWith('<svg') && html.includes('Authenticator setup QR code')));`;
  expect(execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 10_000 })).toBe("true");
});

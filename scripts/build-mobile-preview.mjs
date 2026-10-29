import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mobile = resolve("mobile");
const stamp = resolve(mobile, ".expo/install-fingerprint");
const fingerprint = createHash("sha256").update(readFileSync(resolve(mobile, "package-lock.json"))).update(readFileSync(resolve(mobile, "package.json"))).digest("hex");
if (!existsSync(resolve(mobile, "node_modules/expo/bin/cli")) || !existsSync(stamp) || readFileSync(stamp, "utf8") !== fingerprint) {
  execFileSync("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], { cwd: mobile, stdio: "inherit" });
  mkdirSync(resolve(mobile, ".expo"), { recursive: true }); writeFileSync(stamp, fingerprint);
}
// Rebuild the published preview from the current mobile sources on every deploy.
execFileSync(process.execPath, [resolve(mobile, "node_modules/expo/bin/cli"), "export", "--clear", "--platform", "web", "--max-workers", "2"], {
  cwd: mobile, stdio: "inherit", env: { ...process.env, CI: "1", EXPO_OFFLINE: "1", EXPO_NO_DOTENV: "1", EXPO_PUBLIC_MOBILE_PREVIEW: "1" },
});
const target = resolve("public/mobile-preview");
rmSync(target, { recursive: true, force: true });
cpSync(resolve(mobile, "dist"), target, { recursive: true });
cpSync(resolve(mobile, "assets/favicon-transparent.png"), resolve(target, "favicon-transparent.png"));
const index = resolve(target, "index.html");
writeFileSync(index, readFileSync(index, "utf8")
  .replace(/<link rel="icon"[^>]*>/g, "")
  .replace("</head>", '<link rel="icon" href="/mobile-preview/favicon-transparent.png" type="image/png" /><meta name="robots" content="noindex,nofollow" /></head>'));

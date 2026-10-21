import { defineConfig } from "vitest/config";
import path from "node:path";
import { readFileSync } from "node:fs";

export default defineConfig({
  plugins: [{
    name: "test-cloudflare-wasm-module",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".wasm?module")) return;
      const bytes = readFileSync(id.slice(0, -"?module".length)).toString("base64");
      return `export default new WebAssembly.Module(Uint8Array.from(Buffer.from(${JSON.stringify(bytes)}, "base64")));`;
    },
  }],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
  },
});

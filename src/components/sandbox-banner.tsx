import { currentRuntime } from "@/server/cloudflare/runtime";

export function SandboxBanner() {
  if (currentRuntime().paddle?.environment !== "sandbox") return null;
  return <div role="status" className="border-b border-warn-ink/20 bg-warn-soft px-4 py-3 text-center text-sm text-warn-ink">
    <strong>Payment test environment.</strong> No real charges. Use test accounts and trips here.
  </div>;
}

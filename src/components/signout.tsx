"use client";

import { authClient } from "@/lib/auth-client";
import { clearOfflineData } from "./offline";

// In the header it's hidden on phones (no room); the settings page shows it everywhere.
export function SignOutButton({ className = "hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-flex" }: { className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        await clearOfflineData();
        await authClient.signOut();
        window.location.assign("/");
      }}
    >
      Sign out
    </button>
  );
}

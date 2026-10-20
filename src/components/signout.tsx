"use client";

import { authClient } from "@/lib/auth-client";
import { clearOfflineData } from "./offline";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink sm:inline-flex"
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

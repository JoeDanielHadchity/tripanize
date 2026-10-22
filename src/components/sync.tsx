"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./client";
import type { ChatSummary } from "@/lib/chat";

/**
 * Keeps shared trip data in sync across members' devices: polls the trip's revision counter while the page is
 * visible and refreshes when someone else changed something.
 */
export function SyncWatcher({ tripId, revision, userId, premium = true }: { tripId: string; revision: number; userId: string; premium?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const known = useRef(revision);
  const knownPlan = useRef(premium);
  useEffect(() => {
    known.current = Math.max(known.current, revision);
  }, [revision]);
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.hidden || !navigator.onLine) return;
      try {
        const res = await fetch(`/api/trips/${tripId}/revision`, { cache: "no-store" });
        if (!res.ok) return;
        const r = (await res.json()) as { revision: number; changedBy: { id: string; name: string } | null; chat?: ChatSummary; premium?: boolean };
        if (!stopped && r.premium !== undefined && r.premium !== knownPlan.current) {
          knownPlan.current = r.premium;
          router.refresh();
        }
        if (!stopped && r.chat) window.dispatchEvent(new CustomEvent("tripanize:chat-unread", { detail: { tripId, ...r.chat } }));
        if (!stopped && r.revision > known.current) {
          known.current = r.revision;
          if (r.changedBy && r.changedBy.id !== userId) toast({ tone: "info", message: `Updated with changes from ${r.changedBy.name}.` });
          router.refresh();
        }
      } catch {
        /* offline */
      }
    }
    const t = setInterval(check, 15000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [tripId, userId, router, toast]);
  return null;
}

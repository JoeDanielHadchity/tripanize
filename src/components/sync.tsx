"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./client";

/**
 * Keeps shared trip data in sync across members' devices: polls the trip's revision counter while the page is
 * visible and refreshes when someone else changed something.
 */
export function SyncWatcher({ tripId, revision, userId }: { tripId: string; revision: number; userId: string }) {
  const router = useRouter();
  const toast = useToast();
  const known = useRef(revision);
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
        const r = (await res.json()) as { revision: number; changedBy: { id: string; name: string } | null };
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

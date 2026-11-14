"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/report-error";

/** Reports uncaught errors and failed promises on the website, so problems show up before users
 * have to tell us. Ignores the harmless ResizeObserver warning browsers emit. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => { if (!/ResizeObserver loop/.test(e.message)) reportError(e.error ?? e.message); };
    const onRejection = (e: PromiseRejectionEvent) => { if (!(e.reason instanceof DOMException && e.reason.name === "AbortError")) reportError(e.reason); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}

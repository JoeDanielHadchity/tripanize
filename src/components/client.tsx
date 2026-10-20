"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, cx } from "./ui";

// ───────────── Toasts ─────────────

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.tone === "error" ? 9000 : 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cx(
              "pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-lg",
              t.tone === "error" ? "bg-danger text-white dark:text-black" : t.tone === "success" ? "bg-ink text-bg" : "bg-surface text-ink border border-line",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ───────────── Dialog (native <dialog>: focus trap, Esc to close, focus restore) ─────────────

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      className={cx("m-auto w-[calc(100%-1.5rem)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl", wide ? "max-w-2xl" : "max-w-lg")}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 id={titleId} className="font-display text-lg font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-surface-2" aria-label="Close dialog">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

// ───────────── Confirm ─────────────

type ConfirmOpts = { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(state)} onClose={() => close(false)} title={state?.title ?? ""}>
        <div className="space-y-4 text-sm">
          <div>{state?.message}</div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {state?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </div>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ───────────── Server action runner ─────────────

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; code: string; error: string; details?: unknown };

/**
 * Runs a server action with consistent UX: blocks while offline, prevents double submission, shows errors,
 * asks for confirmation when the server requires it (fixed commitments / confirmed bookings), and refreshes data.
 */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, setPending] = useState(false);
  const inflight = useRef(false);

  const run = useCallback(
    async <T,>(fn: (confirmed: boolean) => Promise<Result<T>>, opts: { success?: string; refresh?: boolean; onError?: (r: Extract<Result<T>, { ok: false }>) => void } = {}): Promise<T | null> => {
      if (inflight.current) return null;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        toast({ tone: "error", message: "You're offline. Reconnect to make changes — nothing was saved." });
        return null;
      }
      inflight.current = true;
      setPending(true);
      try {
        let res = await fn(false);
        if (!res.ok && res.code === "CONFLICT" && (res.details as { needsConfirmation?: boolean } | undefined)?.needsConfirmation) {
          const yes = await confirm({ title: "Please confirm", message: res.error, confirmLabel: "Yes, change it" });
          if (!yes) return null;
          res = await fn(true);
        }
        if (!res.ok) {
          if (opts.onError) opts.onError(res);
          else toast({ tone: "error", message: res.error });
          if (res.code === "CONFLICT") router.refresh();
          return null;
        }
        if (opts.success) toast({ tone: "success", message: opts.success });
        if (opts.refresh !== false) router.refresh();
        return res.data;
      } catch {
        toast({ tone: "error", message: "Couldn't reach the server. Check your connection — nothing was saved." });
        return null;
      } finally {
        inflight.current = false;
        setPending(false);
      }
    },
    [router, toast, confirm],
  );
  return { run, pending };
}

// ───────────── Menu button ─────────────

export function MenuButton({ label, children, align = "right" }: { label: string; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (ref.current?.querySelector("button[aria-haspopup]") as HTMLButtonElement | null)?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-11 items-center gap-1 rounded-xl border border-line bg-surface px-3 text-sm">
        {label} <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className={cx("absolute z-20 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-lg", align === "right" ? "right-0" : "left-0")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

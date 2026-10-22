"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/client";
import { Button, Field, Input, Notice } from "@/components/ui";
import type { ReceiptDraft } from "@/server/expenses/receipt";

export function ReceiptImport({ tripId, open, onClose, onRead }: { tripId: string; open: boolean; onClose: () => void; onRead: (draft: ReceiptDraft) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const close = () => { request.current?.abort(); onClose(); };
  return <Dialog open={open} onClose={close} title="Import a receipt">
    <form className="space-y-4" onSubmit={async e => {
      e.preventDefault();
      if (!file || pending) return;
      if (!navigator.onLine) { setError("Reconnect to read your receipt, or add the expense manually."); return; }
      if (file.size > 8 * 1024 * 1024 || !file.size) { setError("Choose a receipt up to 8 MB."); return; }
      setError(""); setPending(true);
      const controller = new AbortController();
      request.current = controller;
      const timeout = setTimeout(() => controller.abort(), 60_000);
      try {
        const body = new FormData(); body.set("receipt", file);
        const response = await fetch(`/api/trips/${tripId}/expenses/receipt`, { method: "POST", body, signal: controller.signal });
        const data = await response.json() as { draft?: ReceiptDraft; error?: string };
        if (!response.ok || !data.draft) throw new Error(data.error || "Couldn't read this receipt. Try again or enter the expense manually.");
        if (!controller.signal.aborted) onRead(data.draft);
      } catch (err) {
        setError(controller.signal.aborted ? "Reading stopped. Try again or enter the expense manually." : err instanceof Error ? err.message : "Couldn't read the receipt. Please try again.");
      } finally { clearTimeout(timeout); setPending(false); request.current = null; }
    }}>
      <p className="text-sm text-muted">Upload a photo or PDF to fill in the merchant, total, currency, date, and category. You’ll review the details and choose who paid and how to split it before saving.</p>
      <Field label="Receipt" htmlFor="receipt-file" hint="PDF (up to 10 pages), JPG, PNG, or WebP · maximum 8 MB">
        <Input id="receipt-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required disabled={pending} onChange={e => { setFile(e.target.files?.[0] ?? null); setError(""); }} />
      </Field>
      <p className="text-xs text-muted">Your receipt is sent to OpenAI to read it. Tripanize keeps only the details you save as an expense, and does not store the original file.</p>
      {pending && <p role="status" className="text-sm text-accent-ink">Reading your receipt… This may take up to a minute.</p>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="flex justify-end gap-2"><Button onClick={close}>{pending ? "Cancel reading" : "Cancel"}</Button><Button type="submit" variant="primary" disabled={!file || pending}>{pending ? "Reading…" : "Read receipt"}</Button></div>
    </form>
  </Dialog>;
}

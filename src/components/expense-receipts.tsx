"use client";

import { useRef, useState } from "react";
import { Button, Notice } from "@/components/ui";

export type ExpenseReceipt = { id: string; fileName: string; mimeType: string; sizeBytes: number };
const MAX_BYTES = 10 * 1024 * 1024;
const accept = "application/pdf,image/jpeg,image/png,image/webp";

export function ExpenseReceipts({ existing, files, removeIds, onFiles, onRemoveIds, disabled }: {
  existing: ExpenseReceipt[]; files: File[]; removeIds: string[]; onFiles: (files: File[]) => void; onRemoveIds: (ids: string[]) => void; disabled: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const retained = existing.filter(file => !removeIds.includes(file.id));
  function add(selected: FileList | null) {
    if (!selected) return;
    const next = [...files, ...Array.from(selected)];
    if (retained.length + next.length > 5) { setError("Keep up to 5 receipts per payment."); return; }
    if (next.some(file => !file.size) || next.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) { setError("Attach up to 10 MB of new receipts at a time."); return; }
    if (next.some(file => file.type && !accept.split(",").includes(file.type))) { setError("Choose a JPG, PNG, WebP image or PDF."); return; }
    onFiles(next); setError("");
  }
  return <fieldset className="space-y-3 rounded-xl border border-line p-3" disabled={disabled}>
    <legend className="px-1 text-sm font-medium">Receipts (optional)</legend>
    <p className="text-xs text-muted">Attach receipts to this payment. They’re saved when you save the expense and can be opened by members of this trip.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => camera.current?.click()}>Take a photo</Button>
      <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={e => { add(e.target.files); e.target.value = ""; }} aria-label="Take a receipt photo" />
      <Button onClick={() => picker.current?.click()}>Attach image or PDF</Button>
      <input ref={picker} type="file" multiple accept={accept} className="hidden" onChange={e => { add(e.target.files); e.target.value = ""; }} aria-label="Attach receipt images or PDFs" />
    </div>
    <p className="text-xs text-muted">Up to 5 receipts per payment · JPG, PNG, WebP or PDF · 10 MB of new files per save. On supported phones, “Take a photo” opens the camera.</p>
    {(retained.length > 0 || files.length > 0) && <ul className="divide-y divide-line rounded-xl border border-line px-3 text-sm">
      {retained.map(file => <li key={file.id} className="flex items-center justify-between gap-2 py-2">
        <a className="min-w-0 break-all text-accent-ink underline" href={`/api/attachments/${file.id}`} target="_blank" rel="noopener noreferrer">{file.fileName}</a>
        <Button variant="ghost" className="shrink-0 text-danger" aria-label={`Remove receipt ${file.fileName}`} onClick={() => { onRemoveIds([...removeIds, file.id]); setError(""); }}>Remove</Button>
      </li>)}
      {files.map((file, index) => <li key={`${index}-${file.name}`} className="flex items-center justify-between gap-2 py-2">
        <span className="min-w-0 break-all">{file.name}<span className="block text-xs text-muted">{Math.max(1, Math.round(file.size / 1024))} KB · Ready to attach</span></span>
        <Button variant="ghost" className="shrink-0 text-danger" aria-label={`Remove new receipt ${file.name}`} onClick={() => { onFiles(files.filter((_, i) => i !== index)); setError(""); }}>Remove</Button>
      </li>)}
    </ul>}
    {removeIds.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{removeIds.length} receipt{removeIds.length === 1 ? "" : "s"} will be removed when you save.</span><Button variant="ghost" onClick={() => { if (existing.length + files.length > 5) { setError("Remove a new file before restoring these receipts; keep up to 5 per payment."); return; } onRemoveIds([]); setError(""); }}>Undo receipt removals</Button></div>}
    {error && <Notice tone="danger">{error}</Notice>}
  </fieldset>;
}

"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { useAction } from "@/components/client";
import { copyExampleAction } from "@/app/actions/trips";

export function CopyExample({ slug }: { slug: string }) {
  const { run, pending } = useAction();
  const [date, setDate] = useState("");
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4" onSubmit={async (e) => {
      e.preventDefault();
      const r = await run(() => copyExampleAction(slug, date), { refresh: false });
      if (r) window.location.assign(`/trips/${r.id}/itinerary`);
    }}>
      <Field label="Start date for your copy" htmlFor="copy-date"><Input id="copy-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Button type="submit" variant="primary" disabled={pending || !date}>{pending ? "Saving…" : "Save a copy to my trips"}</Button>
    </form>
  );
}

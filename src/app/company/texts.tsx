"use client";
import { useMemo, useState } from "react";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { useAction } from "@/components/client";
import { siteTextsAction } from "@/app/actions/admin-content";
import { SITE_TEXTS, SITE_TEXT_MAX, type SiteTextKey, type SiteTexts } from "@/lib/site-texts";

/** Grouped wording editor. Only fields you change are saved; "Use default" restores the original. */
export function SiteTextsEditor({ texts, changed }: { texts: SiteTexts; changed: SiteTextKey[] }) {
  const { run, pending } = useAction();
  const [values, setValues] = useState<SiteTexts>(texts);
  const groups = useMemo(() => {
    const map = new Map<string, SiteTextKey[]>();
    for (const key of Object.keys(SITE_TEXTS) as SiteTextKey[]) map.set(SITE_TEXTS[key].group, [...(map.get(SITE_TEXTS[key].group) ?? []), key]);
    return [...map.entries()];
  }, []);
  const dirty = (Object.keys(values) as SiteTextKey[]).filter(k => values[k] !== texts[k]);
  const save = () => run(() => siteTextsAction(Object.fromEntries(dirty.map(k => [k, values[k]]))), { success: "Saved. The website updates now; the app shows it the next time it's opened." });

  return <div className="space-y-5">
    <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-3">
      <p className="text-sm text-muted">{dirty.length ? `${dirty.length} unsaved ${dirty.length === 1 ? "change" : "changes"}` : "Change any text, then save."}</p>
      <div className="flex gap-2">{dirty.length > 0 && <Button disabled={pending} onClick={() => setValues(texts)}>Undo</Button>}<Button variant="primary" disabled={pending || !dirty.length} onClick={save}>{pending ? "Saving…" : "Save changes"}</Button></div>
    </div>
    {groups.map(([group, keys]) => <section key={group} className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-semibold">{group}</h3>
      <div className="mt-4 space-y-4">{keys.map(key => {
        const def = SITE_TEXTS[key], value = values[key], isDefault = value === def.text, long = "long" in def && def.long;
        return <div key={key}>
          <div className="mb-1.5 flex flex-wrap items-center gap-2"><label htmlFor={`t-${key}`} className="text-sm font-medium">{def.label}</label>{changed.includes(key) && value === texts[key] && !isDefault && <Badge tone="accent">Changed</Badge>}{value !== texts[key] && <Badge tone="warn">Unsaved</Badge>}
            {!isDefault && <button type="button" className="ml-auto text-xs font-semibold text-accent-ink" onClick={() => setValues({ ...values, [key]: def.text })}>Use default</button>}</div>
          {long ? <Textarea id={`t-${key}`} rows={3} maxLength={SITE_TEXT_MAX} value={value} onChange={e => setValues({ ...values, [key]: e.target.value })} />
            : <Input id={`t-${key}`} maxLength={SITE_TEXT_MAX} value={value} onChange={e => setValues({ ...values, [key]: e.target.value })} />}
          {!isDefault && <p className="mt-1 text-xs text-muted">Default: {def.text}</p>}
        </div>;
      })}</div>
    </section>)}
    <p className="text-sm text-muted">Leaving a field empty restores its default. Prices are set in Paddle and Google Play, not here; if you change a price, update the wording to match.</p>
  </div>;
}

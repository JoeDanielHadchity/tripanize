"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { useAction } from "@/components/client";
import { updateProfileAction } from "@/app/actions/profile";
import { authClient } from "@/lib/auth-client";
import { clearOfflineData } from "@/components/offline";
import { CURRENCIES } from "@/lib/money";
import { INTERESTS } from "@/lib/constants";

type Initial = { name: string; homeCity: string; defaultCurrency: string; pace: "RELAXED" | "BALANCED" | "AMBITIOUS"; interests: string[]; dietary: string; accessibility: string; mapsApp: "GOOGLE" | "APPLE" | "OSM"; timezone: string };

export function AccountForm({ initial }: { initial: Initial }) {
  const { run, pending } = useAction();
  const [v, setV] = useState(initial);
  const [pw, setPw] = useState<{ msg: string; ok: boolean } | null>(null);
  return (
    <div className="space-y-6">
      <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); run(() => updateProfileAction({ ...v, homeCity: v.homeCity || null, dietary: v.dietary || null, accessibility: v.accessibility || null, timezone: v.timezone || null }), { success: "Preferences saved" }); }}>
        <Card className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Profile</h2>
          <Field label="Display name" htmlFor="a-name" hint="Shown to people you travel with."><Input id="a-name" required maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="Home city" htmlFor="a-home"><Input id="a-home" value={v.homeCity} onChange={(e) => setV({ ...v, homeCity: e.target.value })} /></Field>
        </Card>
        <Card className="space-y-4">
          <h2 className="font-display text-lg font-semibold">Travel preferences</h2>
          <p className="text-sm text-muted">Used as defaults for new trips and to tailor packing suggestions. Only share what you're comfortable with.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default currency" htmlFor="a-cur"><Select id="a-cur" value={v.defaultCurrency} onChange={(e) => setV({ ...v, defaultCurrency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Usual pace" htmlFor="a-pace"><Select id="a-pace" value={v.pace} onChange={(e) => setV({ ...v, pace: e.target.value as Initial["pace"] })}><option value="RELAXED">Relaxed</option><option value="BALANCED">Balanced</option><option value="AMBITIOUS">Ambitious</option></Select></Field>
            <Field label="Preferred maps app" htmlFor="a-maps"><Select id="a-maps" value={v.mapsApp} onChange={(e) => setV({ ...v, mapsApp: e.target.value as Initial["mapsApp"] })}><option value="GOOGLE">Google Maps</option><option value="APPLE">Apple Maps</option><option value="OSM">OpenStreetMap</option></Select></Field>
            <Field label="Home time zone" htmlFor="a-tz"><Input id="a-tz" value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} placeholder="e.g. Europe/London" /></Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Interests</legend>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((o) => {
                const on = v.interests.includes(o);
                return <label key={o} className={cx("inline-flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm", on ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted")}><input type="checkbox" className="sr-only" checked={on} onChange={() => setV({ ...v, interests: on ? v.interests.filter((x) => x !== o) : [...v.interests, o] })} />{on ? "✓ " : ""}{o}</label>;
              })}
            </div>
          </fieldset>
          <Field label="Dietary requirements" htmlFor="a-diet"><Input id="a-diet" value={v.dietary} onChange={(e) => setV({ ...v, dietary: e.target.value })} /></Field>
          <Field label="Accessibility needs" htmlFor="a-acc"><Textarea id="a-acc" value={v.accessibility} onChange={(e) => setV({ ...v, accessibility: e.target.value })} /></Field>
        </Card>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Save preferences"}</Button>
      </form>

      <Card className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Password</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const { error } = await authClient.changePassword({ currentPassword: String(f.get("current")), newPassword: String(f.get("next")), revokeOtherSessions: true });
          setPw(error ? { msg: error.message ?? "Couldn't change password.", ok: false } : { msg: "Password changed. Other devices were signed out.", ok: true });
          if (!error) e.currentTarget.reset();
        }}>
          <Field label="Current password" htmlFor="pw-cur"><Input id="pw-cur" name="current" type="password" autoComplete="current-password" required /></Field>
          <Field label="New password" htmlFor="pw-new" hint="At least 10 characters."><Input id="pw-new" name="next" type="password" autoComplete="new-password" minLength={10} required /></Field>
          <div className="sm:col-span-2"><Button type="submit">Change password</Button></div>
        </form>
        {pw && <p role="status" className={pw.ok ? "text-sm text-sage-ink" : "text-sm text-danger"}>{pw.msg}</p>}
        <p className="text-sm text-muted">Forgot it? <Link href="/forgot-password" className="underline">Reset by email</Link>.</p>
      </Card>

      <Card>
        <h2 className="font-display text-lg font-semibold">Sign out</h2>
        <p className="text-sm text-muted">Signing out also removes trips saved for offline use on this device.</p>
        <Button className="mt-3" onClick={async () => { await clearOfflineData(); await authClient.signOut(); window.location.assign("/"); }}>Sign out</Button>
      </Card>
    </div>
  );
}

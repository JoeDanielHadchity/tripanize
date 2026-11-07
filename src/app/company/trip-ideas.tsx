"use client";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Field, Input, LinkButton, Notice, Select, Textarea } from "@/components/ui";
import { useAction, useConfirm } from "@/components/client";
import { tripIdeaAction, tripIdeaPhotoAction } from "@/app/actions/admin-content";
import type { CityGuide, GuideDay, GuideStop } from "@/server/examples/city-guides";
import type { TripIdea } from "@/server/examples/trip-ideas";

const STATUS: Record<string, { label: string; tone: "accent" | "neutral" | "warn" | "danger" | "ai" }> = {
  PUBLISHED: { label: "Live", tone: "accent" }, HIDDEN: { label: "Hidden", tone: "neutral" }, DRAFT: { label: "Draft", tone: "warn" },
  DRAFTING: { label: "AI is writing…", tone: "ai" }, FAILED: { label: "Draft failed", tone: "danger" },
};

/** List of trip ideas with order, visibility and an AI draft form. */
export function TripIdeaList({ ideas }: { ideas: TripIdea[] }) {
  const { run, pending } = useAction(); const ask = useConfirm();
  const [city, setCity] = useState(""), [country, setCountry] = useState(""), [days, setDays] = useState("4");
  const live = ideas.filter(i => i.status === "PUBLISHED").length;
  return <div className="space-y-5">
    <form className="rounded-2xl border border-line bg-surface p-5" onSubmit={async e => { e.preventDefault(); const ok = await run(() => tripIdeaAction({ op: "idea.draft", city, country, days: Number(days) }), { success: "The AI is writing the guide. It takes a few minutes." }); if (ok !== null) { setCity(""); setCountry(""); } }}>
      <h3 className="font-semibold">Add a trip idea</h3>
      <p className="mt-1 text-sm text-muted">Type a city. The AI writes a full guide using official sources; you review it, add a photo and publish.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
        <Field label="City" htmlFor="idea-city"><Input id="idea-city" value={city} onChange={e => setCity(e.target.value)} placeholder="Lisbon" required maxLength={80} /></Field>
        <Field label="Country" htmlFor="idea-country"><Input id="idea-country" value={country} onChange={e => setCountry(e.target.value)} placeholder="Portugal" maxLength={80} /></Field>
        <Field label="Days" htmlFor="idea-days"><Select id="idea-days" value={days} onChange={e => setDays(e.target.value)}>{[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} days</option>)}</Select></Field>
        <Button variant="primary" disabled={pending || city.trim().length < 2}>{pending ? "Starting…" : "Write with AI"}</Button>
      </div>
    </form>
    <p className="text-sm text-muted">{live} live on the website and app, in this order. The first ones show first on the home screen.</p>
    <ol className="space-y-3">{ideas.map((idea, i) => {
      const s = STATUS[idea.status] ?? STATUS.DRAFT;
      return <li key={idea.slug} className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">{idea.photo ? <img src={idea.photo.preview} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted">No photo</div>}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{idea.city}</h3><Badge tone={s.tone}>{s.label}</Badge>{idea.builtin && idea.edited && idea.guide !== null && <Badge>Edited</Badge>}</div>
          <p className="mt-0.5 text-sm text-muted">{[idea.country, idea.guide ? `${idea.guide.days.length} days` : null].filter(Boolean).join(" · ")}{idea.status === "FAILED" && idea.error ? ` · ${idea.error}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button aria-label={`Move ${idea.city} up`} disabled={pending || i === 0} onClick={() => run(() => tripIdeaAction({ op: "idea.move", slug: idea.slug, direction: "up" }))}>↑</Button>
          <Button aria-label={`Move ${idea.city} down`} disabled={pending || i === ideas.length - 1} onClick={() => run(() => tripIdeaAction({ op: "idea.move", slug: idea.slug, direction: "down" }))}>↓</Button>
          {idea.status !== "DRAFTING" && <LinkButton href={`/company?tab=ideas&item=${idea.slug}`}>Edit</LinkButton>}
          {idea.status === "PUBLISHED" ? <Button disabled={pending} onClick={() => run(() => tripIdeaAction({ op: "idea.status", slug: idea.slug, status: "HIDDEN" }), { success: `${idea.city} is hidden` })}>Hide</Button>
            : ["DRAFT", "HIDDEN"].includes(idea.status) ? <Button variant="primary" disabled={pending} onClick={() => run(() => tripIdeaAction({ op: "idea.status", slug: idea.slug, status: "PUBLISHED" }), { success: `${idea.city} is live` })}>Publish</Button> : null}
          {!idea.builtin && idea.status !== "PUBLISHED" && <Button variant="danger" disabled={pending} onClick={async () => { if (await ask({ title: `Delete ${idea.city}?`, message: "This removes the guide and its photos. It can't be undone.", confirmLabel: "Delete", danger: true })) await run(() => tripIdeaAction({ op: "idea.delete", slug: idea.slug }), { success: "Deleted" }); }}>Delete</Button>}
        </div>
      </li>;
    })}</ol>
    {ideas.some(i => i.status === "DRAFTING") && <Notice>Drafts take a few minutes. Refresh this page to see when they're ready.</Notice>}
  </div>;
}

const blankStop = (): GuideStop => ({ time: "10:00", title: "", detail: "", duration: "1 hr", kind: "Free" });

/** Full editor for one guide: wording, days and stops, and photos. */
export function TripIdeaEditor({ idea }: { idea: TripIdea }) {
  const { run, pending } = useAction(); const ask = useConfirm();
  const [g, setG] = useState<CityGuide | null>(idea.guide);
  const [credit, setCredit] = useState("");
  if (!g) return <Notice tone="warn">This guide has no itinerary yet{idea.error ? `: ${idea.error}` : "."} <Link className="underline" href="/company?tab=ideas">Back to trip ideas</Link></Notice>;
  const set = <K extends keyof CityGuide>(k: K, v: CityGuide[K]) => setG({ ...g, [k]: v });
  const setDay = (i: number, d: Partial<GuideDay>) => set("days", g.days.map((x, j) => j === i ? { ...x, ...d } : x));
  const setStop = (di: number, si: number, st: Partial<GuideStop>) => setDay(di, { stops: g.days[di].stops.map((x, j) => j === si ? { ...x, ...st } : x) });
  const text = (label: string, k: "title" | "subtitle" | "budgetRange" | "city" | "country", max = 120) => <Field label={label} htmlFor={`g-${k}`}><Input id={`g-${k}`} value={g[k]} maxLength={max} onChange={e => set(k, e.target.value)} /></Field>;
  const long = (label: string, k: "intro" | "base" | "transport" | "packing", max = 800) => <Field label={label} htmlFor={`g-${k}`}><Textarea id={`g-${k}`} rows={3} value={g[k]} maxLength={max} onChange={e => set(k, e.target.value)} /></Field>;
  const upload = (kind: "card" | "hero") => <form className="space-y-2" onSubmit={async e => { e.preventDefault(); const form = new FormData(e.currentTarget); form.set("slug", idea.slug); form.set("kind", kind); form.set("credit", credit); await run(() => tripIdeaPhotoAction(form), { success: "Photo saved" }); e.currentTarget.reset(); }}>
    <p className="text-sm font-medium">{kind === "card" ? "List photo (4:3, shown on cards)" : "Guide photo (wide, top of the guide page)"}</p>
    <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm" aria-label={kind === "card" ? "List photo" : "Guide photo"} />
    <Button disabled={pending}>Upload</Button>
  </form>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/company?tab=ideas" className="text-sm font-semibold text-accent-ink">← All trip ideas</Link>
      <div className="flex flex-wrap gap-2">{idea.status === "PUBLISHED" && <LinkButton href={`/examples/${idea.slug}`} target="_blank">View live ↗</LinkButton>}
        {idea.builtin && idea.edited && <Button disabled={pending} onClick={async () => { if (await ask({ title: "Restore the original guide?", message: "Your edits and uploaded photos for this guide are removed. Its order and visibility stay as they are.", confirmLabel: "Restore" })) await run(() => tripIdeaAction({ op: "idea.reset", slug: idea.slug }), { success: "Original guide restored" }); }}>Restore original</Button>}
        <Button variant="primary" disabled={pending} onClick={() => run(() => tripIdeaAction({ op: "idea.save", slug: idea.slug, guide: g }), { success: idea.status === "PUBLISHED" ? "Saved. It's live now." : "Saved" })}>{pending ? "Saving…" : "Save changes"}</Button></div></div>

    <section className="rounded-2xl border border-line bg-surface p-5"><h3 className="font-semibold">Photos</h3>
      <div className="mt-4 grid gap-5 md:grid-cols-[14rem_1fr]">
        <div className="overflow-hidden rounded-xl bg-surface-2">{idea.photo ? <img src={idea.photo.card} alt="" className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center text-sm text-muted">No photo yet</div>}</div>
        <div className="grid gap-4 sm:grid-cols-2">{upload("card")}{upload("hero")}
          <Field label="Photo credit" hint="Photographer or source, shown on the guide page" htmlFor="g-credit" className="sm:col-span-2"><Input id="g-credit" value={credit} onChange={e => setCredit(e.target.value)} placeholder="Photo by Ana Silva on Unsplash" maxLength={160} /></Field></div>
      </div>
      <p className="mt-3 text-xs text-muted">Use photos you're allowed to publish (your own, or free licences such as Unsplash). JPEG, PNG or WebP, up to 8 MB.</p>
    </section>

    <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5 md:grid-cols-2"><h3 className="font-semibold md:col-span-2">Overview</h3>
      {text("City", "city", 80)}{text("Country", "country", 80)}{text("Title", "title")}{text("Subtitle", "subtitle", 200)}
      <div className="md:col-span-2">{long("Introduction", "intro", 1200)}</div>
      {text("Budget per person (total)", "budgetRange", 80)}
      <Field label="Budget lines" hint="One per line: label | amount" htmlFor="g-budget"><Textarea id="g-budget" rows={4} value={g.budget.map(b => b.join(" | ")).join("\n")} onChange={e => set("budget", e.target.value.split("\n").filter(Boolean).slice(0, 10).map(l => { const [a, ...b] = l.split("|"); return [a.trim(), b.join("|").trim()]; }))} /></Field>
      {long("Where to stay", "base")}{long("Getting around", "transport")}<div className="md:col-span-2">{long("Packing", "packing")}</div>
    </section>

    {g.days.map((day, di) => <section key={di} className="space-y-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between"><h3 className="font-semibold">Day {di + 1}</h3>{g.days.length > 1 && <Button variant="ghost" onClick={() => set("days", g.days.filter((_, j) => j !== di))}>Remove day</Button>}</div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Title" htmlFor={`d${di}-t`}><Input id={`d${di}-t`} value={day.title} maxLength={120} onChange={e => setDay(di, { title: e.target.value })} /></Field>
        <Field label="Areas" htmlFor={`d${di}-a`}><Input id={`d${di}-a`} value={day.area} maxLength={160} onChange={e => setDay(di, { area: e.target.value })} /></Field>
        <Field label="Pace" htmlFor={`d${di}-p`}><Input id={`d${di}-p`} value={day.pace} maxLength={160} onChange={e => setDay(di, { pace: e.target.value })} /></Field>
        <Field label="Note" htmlFor={`d${di}-n`}><Input id={`d${di}-n`} value={day.note} maxLength={600} onChange={e => setDay(di, { note: e.target.value })} /></Field>
        <Field label="Food nearby" htmlFor={`d${di}-f`}><Input id={`d${di}-f`} value={day.food} maxLength={400} onChange={e => setDay(di, { food: e.target.value })} /></Field>
        <Field label="Plan B" htmlFor={`d${di}-b`}><Input id={`d${di}-b`} value={day.planB} maxLength={400} onChange={e => setDay(di, { planB: e.target.value })} /></Field>
      </div>
      <ol className="space-y-3">{day.stops.map((st, si) => <li key={si} className="grid gap-2 rounded-xl bg-surface-2 p-3 md:grid-cols-[5rem_1fr_7rem_7rem_auto] md:items-start">
        <Input aria-label="Time" value={st.time} maxLength={10} onChange={e => setStop(di, si, { time: e.target.value })} />
        <div className="space-y-2"><Input aria-label="Stop name" value={st.title} maxLength={120} placeholder="Place" onChange={e => setStop(di, si, { title: e.target.value })} /><Textarea aria-label="What to do there" rows={2} value={st.detail} maxLength={600} onChange={e => setStop(di, si, { detail: e.target.value })} /><Input aria-label="Official link" value={st.url ?? ""} maxLength={500} placeholder="https://… (optional)" onChange={e => setStop(di, si, { url: e.target.value || undefined })} /></div>
        <Input aria-label="Duration" value={st.duration} maxLength={40} onChange={e => setStop(di, si, { duration: e.target.value })} />
        <Input aria-label="Type" value={st.kind} maxLength={40} onChange={e => setStop(di, si, { kind: e.target.value })} />
        <Button variant="ghost" aria-label={`Remove ${st.title || "stop"}`} disabled={day.stops.length <= 1} onClick={() => setDay(di, { stops: day.stops.filter((_, j) => j !== si) })}>✕</Button>
      </li>)}</ol>
      {day.stops.length < 10 && <Button onClick={() => setDay(di, { stops: [...day.stops, blankStop()] })}>Add a stop</Button>}
    </section>)}
    {g.days.length < 7 && <Button onClick={() => set("days", [...g.days, { title: `Day ${g.days.length + 1}`, area: "", pace: "", note: "", food: "", planB: "", stops: [blankStop()] }])}>Add a day</Button>}
    <p className="text-sm text-muted">Booking links ({g.bookings.length}) and sources ({g.sources.length}) are kept as written. Save to apply your changes{idea.status === "PUBLISHED" ? "; this guide is live, so the website and app update right away" : ""}.</p>
  </div>;
}

"use client";
import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ExternalLink, Field, Input, LinkButton, Notice, Select, Spinner, Textarea, cx } from "./ui";
import { CreateTrip } from "./create-trip";
import { chooseDestinationAction, createDestinationDraftAction, findDestinationsAction, loadDestinationSearchAction, saveDestinationDraftAction } from "@/app/actions/destinations";
import { DISCOVERY_DEFAULTS, DISCOVERY_INTERESTS, type DiscoveryInput } from "@/server/destinations/schema";
import type { getDestinationSearch, getDestinationWorkspace } from "@/server/destinations/service";

type Search = Awaited<ReturnType<typeof getDestinationSearch>>;
type Workspace = Awaited<ReturnType<typeof getDestinationWorkspace>>;
export function TripStart({ initial, create = false }: { initial: Workspace; create?: boolean }) {
  const [tab, setTab] = useState<"known" | "discover">("known");
  const uid = useId();
  function selectTab(value: "known" | "discover") { setTab(value); }
  return <section aria-label="Start planning a trip" className="mb-10 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
    <div className="brand-backdrop px-5 py-6 text-white sm:px-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Your next adventure</p>
      <h2 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">Where will you go next?</h2>
      <p className="mt-2 max-w-xl text-sm text-white/90">Bring a destination, or just the feeling of a trip. We’ll help with the rest.</p>
    </div>
    <div role="tablist" aria-label="Choose how to start" className="grid grid-cols-2 border-b border-line p-2">
      {([['known', "I know where I’m going", "Continue to trip planning"], ['discover', "Let me help you choose", "Find five ideas that fit you"]] as const).map(([value, label, sub], i) => <button type="button" key={value} role="tab" id={`${uid}-${value}`} aria-controls={`${uid}-${value}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const next = e.key === "Home" ? "known" : e.key === "End" ? "discover" : i === 0 ? "discover" : "known"; selectTab(next); document.getElementById(`${uid}-${next}`)?.focus(); } }} className={cx("min-h-20 rounded-xl px-3 py-3 text-left transition-colors sm:px-5", tab === value ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-surface-2")}><span className="block text-sm font-semibold sm:text-base">{label}</span><span className="mt-1 hidden text-xs sm:block">{sub}</span></button>)}
    </div>
    <div id={`${uid}-known-panel`} role="tabpanel" aria-labelledby={`${uid}-known`} hidden={tab !== "known"} className="p-5 sm:p-7">
      {create ? <CreateTrip /> : <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-display text-xl font-semibold">Already have somewhere in mind?</h3><p className="mt-1 max-w-lg text-sm text-muted">Create your trip, compare Normal and Premium, then add your destination and details.</p></div><LinkButton href="/trips/new" variant="primary">Let’s plan my trip →</LinkButton></div>}
    </div>
    <div id={`${uid}-discover-panel`} role="tabpanel" aria-labelledby={`${uid}-discover`} hidden={tab !== "discover"} className="p-5 sm:p-7"><DestinationSearches initial={initial} /></div>
  </section>;
}
function DestinationSearches({ initial }: { initial: Workspace }) {
  const [searches, setSearches] = useState(initial.searches);
  const [active, setActive] = useState(initial.current?.id ?? null);
  const [loaded, setLoaded] = useState<Record<string, NonNullable<Search>>>(initial.current ? { [initial.current.id]: initial.current } : {});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const uid = useId();
  const update = useCallback((search: NonNullable<Search>) => { setSearches(rows => rows.map(s => s.id === search.id && s.status !== search.status ? { ...s, status: search.status } : s)); }, []);
  async function select(id: string) {
    setActive(id); setError("");
    if (loaded[id]) return;
    setBusy(true);
    try { const r = await loadDestinationSearchAction(id); if (!r.ok) throw new Error(r.error); setLoaded(cache => ({ ...cache, [id]: r.data })); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open this search. Please try again."); }
    finally { setBusy(false); }
  }
  async function add(copyFromId?: string) {
    setBusy(true); setError("");
    try {
      const r = await createDestinationDraftAction(copyFromId); if (!r.ok) throw new Error(r.error);
      setSearches(rows => [...rows, { id: r.data.id, number: r.data.number, status: r.data.status }]);
      setLoaded(cache => ({ ...cache, [r.data.id]: r.data })); setActive(r.data.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create a search. Please try again."); }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = { DRAFT: "Draft", QUEUED: "Queued", RUNNING: "Searching", SUCCEEDED: "Ready", FAILED: "Try again", CANCELLED: "Cancelled" };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-display text-2xl font-semibold">Your destination searches</h3><p className="mt-2 max-w-2xl text-sm text-muted">Explore different dates, budgets or travel styles. Each numbered search keeps its own answers and five ideas.</p></div><Button variant="primary" disabled={busy} onClick={() => add()}>{busy ? "Opening…" : "+ New search"}</Button></div>
    {error && <Notice tone="danger">{error}</Notice>}
    {!!searches.length && <div role="tablist" aria-label="Destination searches" className="flex gap-2 overflow-x-auto border-b border-line pb-3">{searches.map((s, i) => <button type="button" key={s.id} id={`${uid}-tab-${s.id}`} role="tab" aria-controls={`${uid}-panel-${s.id}`} aria-selected={active === s.id} tabIndex={active === s.id ? 0 : -1} disabled={busy} onClick={() => select(s.id)} onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) { e.preventDefault(); const index = e.key === "Home" ? 0 : e.key === "End" ? searches.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + searches.length) % searches.length; void select(searches[index].id); document.getElementById(`${uid}-tab-${searches[index].id}`)?.focus(); } }} className={cx("min-h-14 shrink-0 rounded-xl border px-4 py-2 text-left text-sm", active === s.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:bg-surface-2")}><span className="block font-semibold">Search #{s.number}</span><span className="mt-0.5 block text-xs">{labels[s.status] ?? s.status}</span></button>)}</div>}
    {!searches.length && <Card><h4 className="font-display text-xl font-semibold">Start with Search #1</h4><p className="mt-2 text-sm text-muted">Select “+ New search” to tell us what you have in mind. You can add more searches and compare your options here.</p></Card>}
    {searches.map(s => <div key={s.id} role="tabpanel" id={`${uid}-panel-${s.id}`} aria-labelledby={`${uid}-tab-${s.id}`} hidden={active !== s.id}>{loaded[s.id] ? <DestinationFinder initial={loaded[s.id]} onUpdate={update} onCopy={() => add(s.id)} /> : active === s.id && (error ? <Button onClick={() => select(s.id)}>Try opening this search again</Button> : <Spinner label={`Opening Search #${s.number}…`} />)}</div>)}
    <p className="text-xs text-muted">Drafts and previous results are saved to your account. You can generate up to five sets of ideas per day; failed searches do not use your allowance.</p>
  </div>;
}
function DestinationFinder({ initial, onUpdate, onCopy }: { initial: NonNullable<Search>; onUpdate: (search: NonNullable<Search>) => void; onCopy: () => void }) {
  const [input, setInput] = useState<DiscoveryInput>(initial.input ?? DISCOVERY_DEFAULTS);
  const [search, setSearch] = useState<Search>(initial);
  const [editing, setEditing] = useState(initial.status === "DRAFT");
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [savedInput, setSavedInput] = useState(JSON.stringify(initial.input));
  const [saveStatus, setSaveStatus] = useState("All answers saved");
  const [pollError, setPollError] = useState(""), [choosing, setChoosing] = useState<number | null>(null);
  const router = useRouter(); const uid = useId();
  const pending = search?.status === "QUEUED" || search?.status === "RUNNING";
  const fieldId = (key: string) => `${uid}-${key}`;
  const change = <K extends keyof DiscoveryInput>(key: K, value: DiscoveryInput[K]) => setInput(p => ({ ...p, [key]: value }));
  useEffect(() => { if (search) onUpdate(search); }, [search, onUpdate]);
  useEffect(() => {
    if (!search || search.status !== "DRAFT" || JSON.stringify(input) === savedInput) return;
    let alive = true;
    setSaveStatus("Saving answers…");
    const timer = setTimeout(async () => {
      try { const r = await saveDestinationDraftAction(search.id, input); if (!r.ok) throw new Error(r.error); if (alive) { setSavedInput(JSON.stringify(input)); setSaveStatus(r.data.saved ? "All answers saved" : "Search started"); } }
      catch { if (alive) setSaveStatus("Draft not saved yet. Complete the fields or try again."); }
    }, 700);
    return () => { alive = false; clearTimeout(timer); };
  }, [input, search?.id, search?.status, savedInput]);
  useEffect(() => {
    if (!pending || !search) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try { const response = await fetch(`/api/destinations/${encodeURIComponent(search.id)}`, { cache: "no-store" }); const data = await response.json() as NonNullable<Search> & { error?: string }; if (!response.ok) throw new Error(data.error || "Could not check your search."); if (alive) { setSearch(data); setPollError(""); } }
      catch (e) { if (alive) setPollError(e instanceof Error ? e.message : "Reconnecting to your destination search…"); }
      if (alive) timer = setTimeout(poll, 3000);
    };
    timer = setTimeout(poll, 1500);
    return () => { alive = false; clearTimeout(timer); };
  }, [search?.id, pending]);
  if (!editing && pending) return <div className="space-y-4 py-6"><Spinner label={search.status === "QUEUED" ? "Your destination search is queued…" : "Finding five places for your kind of trip…"} /><p className="max-w-xl text-sm text-muted">We’re comparing your timing, seasonal weather, budget and preferences. This can take a few minutes. You can leave and return to this tab.</p>{pollError && <Notice tone="warn">{pollError} We’ll keep checking automatically.</Notice>}</div>;
  if (!editing && search?.status === "SUCCEEDED" && search.result) return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><Badge tone="accent">Five ideas for you</Badge><h3 className="mt-3 font-display text-2xl font-semibold">A few places you could fall for</h3><p className="mt-2 max-w-2xl text-sm text-muted">{search.result.summary}</p></div><Button disabled={choosing !== null} onClick={onCopy}>Search again with these answers</Button></div>
    <p className="text-xs text-muted">Budget guidance is approximate and includes travel and stays. Seasonal weather describes typical conditions; forecasts can change. Check entry requirements before booking.</p>
    {error && <Notice tone="danger">{error}</Notice>}
    <div className="grid gap-4 lg:grid-cols-2">{search.result.ideas.map((idea, index) => <Card key={`${idea.destination}-${idea.country}`} className={cx("flex flex-col", index === 0 && "border-accent/40 bg-accent-soft/20")}>
      <div className="flex items-center justify-between gap-2"><Badge tone={index === 0 ? "accent" : "neutral"}>{index === 0 ? "Top match" : `Idea ${index + 1}`}</Badge><span className="text-xs text-muted">{idea.country}</span></div>
      <h4 className="mt-3 font-display text-2xl font-semibold">{idea.destination}</h4><p className="mt-2 text-sm">{idea.whyFits}</p>
      <dl className="mt-4 space-y-3 text-sm"><div><dt className="font-semibold">Best timing</dt><dd className="mt-1 text-muted">{idea.bestTime}</dd></div><div><dt className="font-semibold">{idea.weatherKind === "forecast" ? "Current forecast" : idea.weatherKind === "seasonal" ? "Typical seasonal weather" : "Weather information"}</dt><dd className="mt-1 text-muted">{idea.weather}</dd></div><div><dt className="font-semibold">Season & atmosphere</dt><dd className="mt-1 text-muted">{idea.season}</dd></div><div><dt className="font-semibold">Budget & getting there</dt><dd className="mt-1 text-muted">{idea.budgetNote} {idea.travelNote}</dd></div><div><dt className="font-semibold">Something to consider</dt><dd className="mt-1 text-muted">{idea.tradeoff}</dd></div></dl>
      <ul aria-label={`Experiences in ${idea.destination}`} className="mt-4 flex flex-wrap gap-2">{idea.experiences.map(x => <li key={x}><Badge tone="sage">{x}</Badge></li>)}</ul>
      {!!idea.sourceUrls.length && <div className="mt-4 flex flex-wrap gap-3 text-xs">{idea.sourceUrls.map((url, i) => <ExternalLink key={url} href={url}>Source {i + 1}</ExternalLink>)}</div>}
      <Button variant="primary" className="mt-5 w-full sm:whitespace-normal" disabled={choosing !== null} onClick={async () => { setChoosing(index); setError(""); try { const r = await chooseDestinationAction(search.id, index); if (!r.ok) throw new Error(r.error); router.push(r.data.next); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); setChoosing(null); } }}>{choosing === index ? "Opening your trip…" : search.selectedTripId ? "Continue my chosen trip →" : `Plan a trip to ${idea.destination} →`}</Button>
    </Card>)}</div><p className="text-sm text-muted">Choose a place to continue to Normal or Premium. Your destination and answers will carry over. Premium remains $15 per trip.</p>
  </div>;
  if (!editing && search?.status === "FAILED") return <div className="space-y-4"><Notice tone="warn">{search.error || "We couldn’t finish your destination ideas."}</Notice><Button onClick={onCopy}>Copy answers to a new search</Button></div>;
  return <form className="space-y-6" onSubmit={async e => {
    e.preventDefault(); setError("");
    if (step === 1 && !input.interests.length) { setError("Choose at least one thing you’d love to do."); return; }
    if (step < 2) { setStep(s => s + 1); return; }
    setBusy(true);
    try { const r = await findDestinationsAction(input, search?.id); if (!r.ok) throw new Error(r.error); setSearch(r.data); setEditing(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }}>
    <div><p className="text-xs font-semibold uppercase tracking-widest text-accent-ink">Step {step + 1} of 3 · {['Your travel window', 'Your kind of escape', 'The practical details'][step]}</p><h3 tabIndex={-1} className="mt-2 font-display text-2xl font-semibold">{['Let’s start with the basics', 'What would a great trip feel like?', 'Let’s make it realistic'][step]}</h3><p className="mt-2 text-sm text-muted">A few answers are enough to find five places that suit you. No destination needed.</p><div aria-hidden className="mt-4 flex gap-2">{[0, 1, 2].map(n => <span key={n} className={cx("h-1.5 flex-1 rounded-full", n <= step ? "bg-accent" : "bg-line")} />)}</div></div>
    {step === 0 && <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Where would you travel from?" htmlFor={fieldId('from')} className="sm:col-span-2" hint="City and country help us judge travel distance and budget."><Input id={fieldId('from')} value={input.departureCity} onChange={e => change('departureCity', e.target.value)} placeholder="e.g. Beirut, Lebanon" maxLength={120} minLength={2} required /></Field>
      <Field label="When would you like to go?" htmlFor={fieldId('timing')}><Select id={fieldId('timing')} value={input.timing} onChange={e => change('timing', e.target.value as DiscoveryInput['timing'])}><option value="month">I have a month in mind</option><option value="dates">I know my dates</option><option value="flexible">I’m flexible — suggest a good time</option></Select></Field>
      {input.timing === 'month' && <Field label="Preferred month" htmlFor={fieldId('month')}><Input id={fieldId('month')} type="month" min={new Date().toISOString().slice(0, 7)} required value={input.month} onChange={e => change('month', e.target.value)} /></Field>}
      {input.timing === 'dates' ? <><Field label="Departure date" htmlFor={fieldId('start')}><Input id={fieldId('start')} type="date" min={new Date().toISOString().slice(0, 10)} required value={input.startDate} onChange={e => change('startDate', e.target.value)} /></Field><Field label="Return date" htmlFor={fieldId('end')}><Input id={fieldId('end')} type="date" min={input.startDate || new Date().toISOString().slice(0, 10)} required value={input.endDate} onChange={e => change('endDate', e.target.value)} /></Field></> : <Field label="How many days?" htmlFor={fieldId('days')}><Input id={fieldId('days')} type="number" min={2} max={30} required value={input.days} onChange={e => change('days', Number(e.target.value))} /></Field>}
      <Field label="Adults" htmlFor={fieldId('adults')}><Input id={fieldId('adults')} type="number" min={1} max={50} required value={input.adults} onChange={e => change('adults', Number(e.target.value))} /></Field><Field label="Children" htmlFor={fieldId('children')}><Input id={fieldId('children')} type="number" min={0} max={50} required value={input.children} onChange={e => change('children', Number(e.target.value))} /></Field>
    </div>}
    {step === 1 && <div className="space-y-5"><fieldset><legend className="text-sm font-semibold">What would you love to do? <span className="font-normal text-muted">Choose at least one.</span></legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{DISCOVERY_INTERESTS.map(interest => <label key={interest} className={cx("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm", input.interests.includes(interest) ? "border-accent bg-accent-soft text-accent-ink" : "border-line")}><input type="checkbox" checked={input.interests.includes(interest)} onChange={e => change('interests', e.target.checked ? [...input.interests, interest] : input.interests.filter(x => x !== interest))} className="h-4 w-4 accent-accent" />{interest}</label>)}</div></fieldset><div className="grid gap-5 sm:grid-cols-2"><Field label="What weather do you enjoy?" htmlFor={fieldId('climate')}><Select id={fieldId('climate')} value={input.climate} onChange={e => change('climate', e.target.value as DiscoveryInput['climate'])}>{['Warm & sunny', 'Mild & comfortable', 'Cold or snowy', 'No preference'].map(x => <option key={x}>{x}</option>)}</Select></Field><Field label="Your ideal pace" htmlFor={fieldId('pace')}><Select id={fieldId('pace')} value={input.pace} onChange={e => change('pace', e.target.value as DiscoveryInput['pace'])}><option value="RELAXED">Slow & relaxed</option><option value="BALANCED">A little of everything</option><option value="AMBITIOUS">See & do as much as possible</option></Select></Field></div></div>}
    {step === 2 && <div className="grid gap-5 sm:grid-cols-2"><Field label="Whole-trip budget per person (USD)" htmlFor={fieldId('budget')} hint="Include transport, accommodation, meals and activities. We’ll use this as a guide."><Input id={fieldId('budget')} type="number" min={100} max={100000} required value={input.budget} onChange={e => change('budget', Number(e.target.value))} /></Field><Field label="How far are you happy to travel?" htmlFor={fieldId('distance')} hint="Approximate travel time each way; connections may add time."><Select id={fieldId('distance')} value={input.distance} onChange={e => change('distance', e.target.value as DiscoveryInput['distance'])}>{['Nearby — up to 3 hours', 'Up to 6 hours', 'Anywhere'].map(x => <option key={x}>{x}</option>)}</Select></Field><Field label="What atmosphere suits you?" htmlFor={fieldId('crowds')}><Select id={fieldId('crowds')} value={input.crowds} onChange={e => change('crowds', e.target.value as DiscoveryInput['crowds'])}>{['Quiet & less crowded', 'A balance', 'Lively & popular'].map(x => <option key={x}>{x}</option>)}</Select></Field><Field label="Anything else to consider? (optional)" htmlFor={fieldId('constraints')} className="sm:col-span-2" hint="Passport or visa constraints (no document numbers), children’s ages, accessibility, places to avoid, or a special occasion."><Textarea id={fieldId('constraints')} value={input.constraints} onChange={e => change('constraints', e.target.value)} maxLength={800} placeholder="e.g. We prefer easy walks and would love somewhere new." /></Field></div>}
    {error && <Notice tone="danger">{error}</Notice>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div>{step > 0 ? <Button disabled={busy} onClick={() => { setStep(s => s - 1); setError(""); }}>← Back</Button> : <span className="text-xs text-muted" role="status">{saveStatus}</span>}</div><Button type="submit" variant="primary" disabled={busy}>{busy ? "Starting your search…" : step === 2 ? "Find my five destinations →" : "Continue →"}</Button></div><p className="text-xs text-muted">Destination ideas are free to explore. You’ll choose Normal or Premium after choosing a place.</p>
  </form>;
}

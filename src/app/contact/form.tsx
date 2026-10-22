"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { SUPPORT_TOPICS, type SupportTopic } from "@/lib/support";

export function ContactForm({ available, initialTopic }: { available: boolean; initialTopic: SupportTopic }) {
  const requestId = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !available) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    requestId.current ??= crypto.randomUUID();
    setPending(true); setError("");
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: fields.get("name"), email: fields.get("email"), topic: fields.get("topic"), message: fields.get("message"), website: fields.get("website"), requestId: requestId.current }) });
      const result = await response.json() as { sent?: boolean; reference?: string; error?: string };
      if (!response.ok || !result.sent) throw new Error(result.error ?? "Your message could not be sent. Please try again.");
      setReference(result.reference ?? requestId.current); form.reset(); requestId.current = null;
    } catch (e) { setError(e instanceof Error ? e.message : "Check your connection and try again."); }
    finally { setPending(false); }
  }
  if (reference) return <Notice tone="sage" title="Your message has been sent"><p>We’ll reply to the email address you provided. Keep this reference: <span className="break-all font-mono text-xs">{reference}</span>.</p><Button className="mt-3" onClick={() => setReference("")}>Send another message</Button></Notice>;
  return <form onSubmit={submit} className="space-y-4">
    {!available && <Notice tone="warn">The contact form is temporarily unavailable. Please try again later. For an existing Paddle payment, visit <a href="https://paddle.net" className="underline" target="_blank" rel="noopener noreferrer">paddle.net</a>.</Notice>}
    {error && <Notice tone="danger">{error}</Notice>}
    <div className="grid gap-4 sm:grid-cols-2"><Field label="Your name" htmlFor="support-name"><Input id="support-name" name="name" required maxLength={80} autoComplete="name" /></Field><Field label="Email for our reply" htmlFor="support-email"><Input id="support-email" name="email" type="email" required maxLength={254} autoComplete="email" /></Field></div>
    <Field label="What can we help with?" htmlFor="support-topic"><Select id="support-topic" name="topic" defaultValue={initialTopic}>{Object.entries(SUPPORT_TOPICS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
    <Field label="Your message" htmlFor="support-message" hint="10–4,000 characters. For account questions, use the email associated with your account."><Textarea id="support-message" name="message" required minLength={10} maxLength={4000} rows={7} /></Field>
    <div aria-hidden="true" className="hidden"><label htmlFor="support-website">Leave this field empty</label><input id="support-website" name="website" autoComplete="off" tabIndex={-1} defaultValue="" /></div>
    <p className="text-xs leading-5 text-muted">Your name, reply email and message are sent privately to Tripanize support through our email provider. See our <Link href="/privacy" className="text-accent-ink underline underline-offset-2">privacy policy</Link>. Never send passwords, full card details, bank information or identity documents.</p>
    <Button type="submit" variant="primary" disabled={pending || !available}>{pending ? "Sending…" : "Send message"}</Button>
  </form>;
}

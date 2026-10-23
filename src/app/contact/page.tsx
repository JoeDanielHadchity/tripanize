import type { Metadata } from "next";
import Link from "next/link";
import { PublicHeader } from "@/components/public-page";
import { Card, PageHeader } from "@/components/ui";
import { OPERATOR_COUNTRY, OPERATOR_NAME } from "@/lib/legal";
import { SUPPORT_TOPICS, type SupportTopic } from "@/lib/support";
import { supportConfigured } from "@/server/support/service";
import { ContactForm } from "./form";

export const metadata: Metadata = { title: "Contact and support" };
export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const initialTopic: SupportTopic = topic && Object.hasOwn(SUPPORT_TOPICS, topic) ? topic as SupportTopic : "general";
  return <><PublicHeader /><main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-8">
    <PageHeader title="A little help along the way" subtitle="Questions about your trip, your account or a Premium payment? Send a message to Tripanize support." />
    <div className="mb-6 grid gap-4 sm:grid-cols-2"><Card><h2 className="font-display text-xl font-semibold">Who you’re contacting</h2><p className="mt-2 text-sm leading-6 text-muted">Tripanize is operated by {OPERATOR_NAME}, based in {OPERATOR_COUNTRY}. Your message goes directly to the company’s support inbox.</p></Card><Card><h2 className="font-display text-xl font-semibold">Payment help</h2><p className="mt-2 text-sm leading-6 text-muted">For a Paddle charge or refund request, use your receipt’s support link or <a href="https://paddle.net" target="_blank" rel="noopener noreferrer" className="text-accent-ink underline">paddle.net</a>. Read our <Link href="/refunds" className="text-accent-ink underline">refund policy</Link> for details.</p></Card></div>
    <Card><ContactForm available={supportConfigured()} initialTopic={initialTopic} /></Card>
  </main></>;
}

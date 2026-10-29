import Link from "next/link";
import type { ReactNode } from "react";
import { getSessionUser } from "@/server/auth/session";
import { FEATURE_PAGES, type FeaturePath } from "@/lib/feature-pages";
import { PublicHeader } from "./public-header";
import { LinkButton } from "./ui";

type FeaturePageProps = {
  path: FeaturePath;
  eyebrow: string;
  title: string;
  emphasis: string;
  intro: string;
  planNote: string;
  preview: ReactNode;
  children: ReactNode;
  questions: { question: string; answer: ReactNode }[];
};

export async function FeaturePage({ path, eyebrow, title, emphasis, intro, planNote, preview, children, questions }: FeaturePageProps) {
  const user = await getSessionUser();
  const create = user ? "/trips/new" : "/sign-up";
  return <div className="feature-page">
    <PublicHeader currentPath={path} user={user} />
    <main id="main" className="feature-content">
      <section className="feature-hero" aria-labelledby="feature-title">
        <div className="feature-hero-copy"><p className="feature-eyebrow">{eyebrow}</p><h1 id="feature-title">{title} <em>{emphasis}</em></h1><p className="feature-intro">{intro}</p><div className="hero-actions"><LinkButton href={create} variant="primary">Create a trip <span aria-hidden="true">→</span></LinkButton><LinkButton href="/examples/lisbon-porto">View example itinerary</LinkButton></div><p className="feature-plan-note">{planNote} <Link href="/plans">Compare plans</Link></p></div>
        {preview}
      </section>
      {children}
      <section className="feature-faq" aria-labelledby="questions-title"><div><p className="feature-eyebrow">Before you go</p><h2 id="questions-title">A few useful answers.</h2></div><div>{questions.map(({ question, answer }) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><div className="feature-answer">{answer}</div></details>)}</div></section>
      <section className="feature-fare" aria-labelledby="fare-title"><div><p className="feature-eyebrow">One trip. Everyone included.</p><h2 id="fare-title">Start free. Go further for $15.</h2><p>Premium is one payment per trip, for any group size. No subscription. Applicable tax is shown before payment. AI usage limits apply.</p></div><LinkButton href={create} variant="primary">Create your trip <span aria-hidden="true">→</span></LinkButton></section>
      <nav className="feature-related" aria-label="More Tripanize tools">{FEATURE_PAGES.filter(feature => feature.href !== path).map(feature => <Link href={feature.href} key={feature.href}><span>{feature.label} <span aria-hidden="true">↗</span></span><small>{feature.description}</small></Link>)}</nav>
    </main>
  </div>;
}

export function FeatureSteps({ title, steps }: { title: string; steps: { title: string; copy: string }[] }) {
  return <section className="feature-steps"><h2>{title}</h2><ol>{steps.map((step, i) => <li key={step.title}><span className="feature-number" aria-hidden="true">0{i + 1}</span><h3>{step.title}</h3><p>{step.copy}</p></li>)}</ol></section>;
}

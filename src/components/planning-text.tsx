import type { ReactNode } from "react";
import { safeUrl } from "@/lib/maps";

/** Small, deliberately HTML-free renderer for planner prose and source links. */
export function PlanningText({ text, className }: { text: string; className?: string }) {
  const clean = text.replace(/【[^】]*】|[^]*/g, "");
  const tokens = /\[([^\]\n]+)\]\(([^\s]*?(?:\([^\s()]*\)[^\s()]*?)?)\)|\*\*([^*\n]+)\*\*|https?:\/\/[^\s<>]+/g;
  const parts: ReactNode[] = [];
  let end = 0;
  for (const match of clean.matchAll(tokens)) {
    parts.push(clean.slice(end, match.index));
    if (match[3]) parts.push(<strong key={match.index}>{match[3]}</strong>);
    else {
      const raw = match[2] ?? match[0].replace(/[.,;!?)]+$/, "");
      const href = safeUrl(raw);
      const label = match[1] ?? (href ? new URL(href).hostname.replace(/^www\./, "") : raw);
      parts.push(href ? <a key={match.index} href={href} target="_blank" rel="noopener noreferrer" className="break-words text-accent-ink underline underline-offset-2">{label}</a> : label);
      if (!match[2]) parts.push(match[0].slice(raw.length));
    }
    end = match.index! + match[0].length;
  }
  parts.push(clean.slice(end));
  return <span className={className}>{parts}</span>;
}

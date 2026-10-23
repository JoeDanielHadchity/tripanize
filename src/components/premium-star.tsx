import { cx } from "./ui";

export function PremiumStar({ className }: { className?: string }) {
  return <span title="Premium feature" className={cx("inline-flex shrink-0 align-middle", className ?? "text-accent-ink")}><svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5"><path d="m10 1.8 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8L10 1.8Z" /></svg><span className="sr-only">Premium</span></span>;
}

import { PLAN_COMPARISON } from "@/lib/plans";
import { PremiumStar } from "./premium-star";

export function PlanComparison() {
  return <div className="overflow-x-auto rounded-2xl border border-line bg-surface"><table className="w-full text-left text-sm"><caption className="sr-only">Standard and Premium benefits</caption><thead className="bg-surface-2"><tr><th scope="col" className="p-3 sm:p-4">Your trip</th><th scope="col" className="p-3 sm:p-4">Standard · Free</th><th scope="col" className="p-3 text-accent-ink sm:p-4"><span className="inline-flex items-center gap-1.5">Premium · $15 <PremiumStar /></span></th></tr></thead><tbody className="divide-y divide-line">{PLAN_COMPARISON.map(row => <tr key={row.feature}><th scope="row" className="p-3 font-medium sm:p-4">{row.feature}</th><td className="p-3 text-muted sm:p-4">{row.normal}</td><td className="p-3 font-medium sm:p-4">{row.premium}</td></tr>)}</tbody></table></div>;
}

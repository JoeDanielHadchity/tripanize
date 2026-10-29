import Link from "next/link";
import { FEATURE_PAGES } from "@/lib/feature-pages";

const PAGES = [{ href: "/", label: "Home" }, { href: "/plans", label: "Plans" }, ...FEATURE_PAGES];

export function SiteNavigation({ currentPath }: { currentPath?: string }) {
  return <>{PAGES.map(page => <Link key={page.href} href={page.href} className="public-nav-link" aria-current={currentPath === page.href ? "page" : undefined}>{page.label}</Link>)}</>;
}

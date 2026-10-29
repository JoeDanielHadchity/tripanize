import Link from "next/link";
import { FEATURE_PAGES } from "@/lib/feature-pages";
import { Logo, SettingsLink } from "./shell";
import { LinkButton } from "./ui";

const PAGES = [{ href: "/", label: "Home" }, { href: "/plans", label: "Plans" }, ...FEATURE_PAGES];

export function PublicHeader({ currentPath, authenticated = false, signInHref = "/sign-in" }: {
  currentPath?: string;
  authenticated?: boolean;
  signInHref?: string;
}) {
  return (
    <header className="public-header public-site-header">
      <Link href="/" aria-label="Tripanize home"><Logo /></Link>
      <nav aria-label="Main">
        {PAGES.map(page => <Link key={page.href} href={page.href} className="public-nav-link" aria-current={currentPath === page.href ? "page" : undefined}>{page.label}</Link>)}
        <SettingsLink active={currentPath === "/settings"} />
        <Link href={authenticated ? "/trips" : signInHref} className="public-nav-link">{authenticated ? "My trips" : "Sign in"}</Link>
        <LinkButton href={authenticated ? "/trips/new" : "/sign-up"} variant="primary">Create a trip</LinkButton>
      </nav>
    </header>
  );
}

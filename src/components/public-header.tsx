import Link from "next/link";
import { Logo, SettingsLink } from "./shell";
import { LinkButton } from "./ui";
import { SiteNavigation } from "./site-navigation";

export function PublicHeader({ currentPath, authenticated = false, signInHref = "/sign-in" }: {
  currentPath?: string;
  authenticated?: boolean;
  signInHref?: string;
}) {
  return (
    <header className="public-header public-site-header">
      <Link href="/" aria-label="Tripanize home"><Logo /></Link>
      <nav aria-label="Main">
        <SiteNavigation currentPath={currentPath} />
        <SettingsLink active={currentPath === "/settings"} />
        <Link href={authenticated ? "/trips" : signInHref} className="public-nav-link">{authenticated ? "My trips" : "Sign in"}</Link>
        <LinkButton href={authenticated ? "/trips/new" : "/sign-up"} variant="primary">Create a trip</LinkButton>
      </nav>
    </header>
  );
}

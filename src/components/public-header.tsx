import Link from "next/link";
import type { SessionUser } from "@/server/auth/session";
import { AppHeader, Logo, SettingsLink } from "./shell";
import { LinkButton } from "./ui";
import { SiteNavigation } from "./site-navigation";

export function PublicHeader({ currentPath, user, signInHref = "/sign-in" }: {
  currentPath?: string;
  user?: SessionUser | null;
  signInHref?: string;
}) {
  if (user) return <AppHeader user={user} currentPath={currentPath} />;
  return (
    <header className="public-header public-site-header">
      <Link href="/" aria-label="Tripanize home"><Logo /></Link>
      <nav aria-label="Main">
        <SiteNavigation currentPath={currentPath} />
        <SettingsLink active={currentPath === "/settings"} />
        <Link href={signInHref} className="public-nav-link">Sign in</Link>
        <LinkButton href="/sign-up" variant="primary">Create a trip</LinkButton>
      </nav>
    </header>
  );
}

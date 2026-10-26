import Link from "next/link";
import { Logo } from "@/components/shell";
import { AuthArtwork } from "@/components/journey-cover";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <AuthArtwork />
      <main id="main" className="flex flex-col px-4 py-8 sm:px-8 lg:py-12">
        <Link href="/" className="mb-10 self-start">
          <Logo />
        </Link>
        <div className="mx-auto w-full max-w-sm flex-1">{children}</div>
      </main>
    </div>
  );
}

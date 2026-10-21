import Link from "next/link";
import { Logo } from "@/components/shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#0f766e_0%,#2a9d8f_50%,#c2553a_100%)] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="font-display text-4xl leading-tight">A little less planning.<br />A lot more going.</p>
          <p className="mt-4 max-w-sm text-white/85">Plan with AI, share with your people, and keep every booking, euro and sock in one calm place.</p>
        </div>
      </div>
      <main id="main" className="flex flex-col px-4 py-8 sm:px-8">
        <Link href="/" className="mb-10 self-start">
          <Logo />
        </Link>
        <div className="mx-auto w-full max-w-sm flex-1">{children}</div>
      </main>
    </div>
  );
}

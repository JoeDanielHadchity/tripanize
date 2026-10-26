import Link from "next/link";
import { Logo } from "@/components/shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden brand-backdrop lg:block">
        <svg aria-hidden className="absolute inset-x-0 top-16 h-40 w-full text-white/80" viewBox="0 0 600 160" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <g className="tp-drift-slow">
            <path d="M60 70 c0-14 20-20 28-11 c6-14 31-14 34 3 c14 0 17 17 3 20 h-62 c-11 0-11-12-3-12z" />
            <path d="M330 40 c0-11 16-16 22-8 c5-11 25-11 27 2 c11 0 13 13 2 16 h-48 c-9 0-9-10-3-10z" />
            <path d="M620 90 c0-14 20-20 28-11 c6-14 31-14 34 3 c14 0 17 17 3 20 h-62 c-11 0-11-12-3-12z" />
          </g>
          <path d="M190 120 L236 98 L220 140 L212 124 Z M212 124 L236 98" />
          <path d="M150 132 C 165 126, 175 138, 190 128" strokeDasharray="2 8" />
        </svg>
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

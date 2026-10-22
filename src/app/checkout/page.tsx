import type { Metadata } from "next";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { checkoutAvailable } from "@/server/billing/config";
import { prisma } from "@/server/db";
import { Logo } from "@/components/shell";
import { LinkButton, Notice, PageHeader } from "@/components/ui";
import { PaymentLink } from "./payment-link";
export const metadata: Metadata = { title: "Premium checkout", robots: { index: false, follow: false } };
export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ _ptxn?: string }> }) {
  const { _ptxn } = await searchParams; const c = currentRuntime().paddle;
  const intent = c && _ptxn && /^txn_[a-z0-9]{26}$/.test(_ptxn) ? await prisma.premiumCheckout.findUnique({ where: { transactionId: _ptxn }, select: { environment: true, status: true } }) : null;
  const ready = checkoutAvailable() && c && intent?.environment === c.environment && intent.status === "PENDING";
  return <><header className="mx-auto max-w-3xl px-4 py-5"><Logo /></header><main id="main" className="mx-auto max-w-3xl px-4 pb-16 pt-8"><PageHeader title="Premium checkout" subtitle="Your payment is handled securely by Paddle." />{ready ? <PaymentLink transactionId={_ptxn!} token={c.clientToken} environment={c.environment} /> : <Notice>This payment link is unavailable or has already been processed. Open your trip to check its payment status.</Notice>}<LinkButton href="/trips" className="mt-5">Open my trips</LinkButton></main></>;
}

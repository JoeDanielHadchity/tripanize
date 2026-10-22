"use client";
import { useEffect, useRef, useState } from "react";
import { preparePaddle } from "@/components/premium-checkout";
import { Button, Notice } from "@/components/ui";
export function PaymentLink({ transactionId, token, environment }: { transactionId: string; token: string; environment: "sandbox" | "live" }) {
  const started = useRef(false); const [error, setError] = useState(""); const [complete, setComplete] = useState(false);
  async function open() {
    setError("");
    try { const paddle = await preparePaddle(token, environment, event => { if (event.name === "checkout.completed") setComplete(true); }); paddle.Checkout.open({ transactionId, settings: { displayMode: "overlay", showAddDiscounts: false, showAddTaxId: true } }); }
    catch (e) { setError(e instanceof Error ? e.message : "Checkout could not be loaded."); }
  }
  useEffect(() => { if (!started.current) { started.current = true; void open(); } }, []);
  return <div className="space-y-4">{environment === "sandbox" && <Notice tone="warn">Test checkout only. No real payment is taken.</Notice>}{complete ? <Notice tone="sage">Payment submitted. Open your trip and check payment status to confirm Premium.</Notice> : <Button onClick={open} variant="primary">Open payment checkout</Button>}{error && <Notice tone="danger">{error}</Notice>}</div>;
}

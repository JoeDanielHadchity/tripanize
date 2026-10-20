import type { Metadata } from "next";
import { emailConfigured } from "@/server/notifications/email";
import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPage() {
  return <ForgotForm emailReady={emailConfigured()} />;
}

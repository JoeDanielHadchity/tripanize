import nodemailer, { type Transporter } from "nodemailer";

// Email delivery is a separate, optional integration. When SMTP_URL is not set we never pretend a
// message was sent: callers receive { status: "not_configured" } and must surface that to the user.

export type EmailResult =
  | { status: "sent"; providerId: string | null }
  | { status: "not_configured" }
  | { status: "failed"; error: string };

let transporter: Transporter | null = null;

export function emailConfigured() {
  return Boolean(process.env.SMTP_URL);
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<EmailResult> {
  if (!process.env.SMTP_URL) {
    if (process.env.NODE_ENV !== "production" && process.env.DEV_LOG_EMAILS === "true") {
      // Development aid only, explicitly opted into. Never enabled in production.
      console.info(`[dev email, not delivered] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    }
    return { status: "not_configured" };
  }
  try {
    transporter ??= nodemailer.createTransport(process.env.SMTP_URL);
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM ?? "Roam <no-reply@localhost>",
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    // Only a provider acceptance counts as "sent".
    if (info.rejected?.length) return { status: "failed", error: "Recipient rejected by mail server" };
    return { status: "sent", providerId: info.messageId ?? null };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message.slice(0, 200) : "Unknown email error" };
  }
}

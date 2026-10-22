import nodemailer, { type Transporter } from "nodemailer";

// Email delivery is a separate, optional integration: Resend (RESEND_API_KEY) or any SMTP server (SMTP_URL).
// When neither is set we never pretend a message was sent: callers receive { status: "not_configured" }
// and must surface that to the user.

export type EmailResult =
  | { status: "sent"; providerId: string | null }
  | { status: "not_configured" }
  | { status: "failed"; error: string; retryable?: boolean; retryAfterMs?: number };

type EmailMessage = { to: string; subject: string; text: string; html?: string; replyTo?: string; idempotencyKey?: string };

let transporter: Transporter | null = null;

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY || process.env.SMTP_URL);
}

const from = () => process.env.EMAIL_FROM ?? "Tripanize <no-reply@localhost>";

async function sendWithResend(msg: EmailMessage): Promise<EmailResult> {
  // RESEND_API_URL exists only so tests can point at a local stand-in.
  const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...(msg.idempotencyKey ? { "Idempotency-Key": msg.idempotencyKey } : {}) },
    body: JSON.stringify({ from: from(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html, reply_to: msg.replyTo }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) {
    const retryAfter = res.headers.get("Retry-After");
    const retryAfterMs = retryAfter ? (/^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : undefined;
    return { status: "failed", error: `Resend ${res.status}: ${String(body.message ?? res.statusText).slice(0, 180)}`, retryable: res.status === 429 || res.status >= 500, retryAfterMs: Number.isFinite(retryAfterMs) ? Math.min(retryAfterMs!, 3600_000) : undefined };
  }
  return { status: "sent", providerId: body.id ?? null };
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (process.env.RESEND_API_KEY) {
    try {
      return await sendWithResend(msg);
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message.slice(0, 200) : "Unknown email error" };
    }
  }
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
      from: from(),
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      replyTo: msg.replyTo,
    });
    // Only a provider acceptance counts as "sent".
    if (info.rejected?.length) return { status: "failed", error: "Recipient rejected by mail server" };
    return { status: "sent", providerId: info.messageId ?? null };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message.slice(0, 200) : "Unknown email error" };
  }
}

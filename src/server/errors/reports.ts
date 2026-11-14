import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { sendEmail } from "@/server/notifications/email";

// Crash reporting without a third-party service: the server, website and app send unexpected errors
// here. Each kind of error is one row (by fingerprint) with a count. The company admin gets an email
// when a new kind appears or a fixed one comes back — at most one per error per day and 20 a day.

export type ErrorSource = "server" | "web" | "app";
const ALERT_EVERY_MS = 24 * 3600_000;
const MAX_ALERTS_PER_DAY = 20;

/** Removes things that identify people or sessions before an error is stored or emailed. */
export function scrub(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/([?&][^=\s&#]+=)[^&\s#)]*/g, "$1…")
    .replace(/\b(Bearer|token|cookie|session)[=: ]+\S+/gi, "$1 [hidden]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[id]");
}

/** Same bug → same fingerprint: ids, numbers and quoted values are ignored. */
export function fingerprint(source: ErrorSource, message: string, stack?: string | null) {
  const norm = (s: string) => s.replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "#").replace(/\bc[a-z0-9]{20,}\b/g, "#").replace(/\d+/g, "#").replace(/(["'`]).*?\1/g, "$1…$1");
  const frame = (stack ?? "").split("\n").map(l => l.trim()).find(l => l.startsWith("at ") || /@\S+:\d+/.test(l)) ?? "";
  return createHash("sha256").update(`${source}|${norm(message).slice(0, 300)}|${norm(frame).replace(/:#(:#)?/g, "")}`).digest("hex").slice(0, 32);
}

export const errorReportInput = z.object({
  source: z.enum(["web", "app"]),
  message: z.string().trim().min(1).max(1000),
  stack: z.string().max(6000).optional(),
  where: z.string().max(300).optional(),
  appVersion: z.string().max(40).optional(),
});

/** Records one occurrence. Never throws: error reporting must not cause new errors. */
export async function recordError(input: { source: ErrorSource; message: string; stack?: string | null; where?: string | null; appVersion?: string | null; userId?: string | null }) {
  try {
    const message = scrub(input.message).slice(0, 1000);
    const stack = input.stack ? scrub(input.stack).slice(0, 4000) : null;
    const where = input.where ? scrub(input.where).slice(0, 300) : null;
    const fp = fingerprint(input.source, message, stack);
    const now = new Date();
    const existing = await prisma.errorReport.findUnique({ where: { fingerprint: fp } });
    const row = existing
      ? await prisma.errorReport.update({ where: { fingerprint: fp }, data: { count: { increment: 1 }, lastSeenAt: now, lastUserId: input.userId ?? existing.lastUserId, stack: stack ?? existing.stack, where: where ?? existing.where, appVersion: input.appVersion ?? existing.appVersion } })
      : await prisma.errorReport.create({ data: { fingerprint: fp, source: input.source, message, stack, where, appVersion: input.appVersion ?? null, lastUserId: input.userId ?? null } });
    const returned = Boolean(existing?.resolvedAt);
    if (returned) await prisma.errorReport.update({ where: { id: row.id }, data: { resolvedAt: null } });
    const due = !row.alertedAt || returned || now.getTime() - row.alertedAt.getTime() > ALERT_EVERY_MS;
    if (due) await alert({ ...row, returned });
  } catch (error) {
    console.error("[error-reports] could not record", error instanceof Error ? error.message : "failed");
  }
}

async function alert(row: { id: string; source: string; message: string; stack: string | null; where: string | null; appVersion: string | null; count: number; firstSeenAt: Date; returned: boolean }) {
  const to = currentRuntime().companyAdminEmail;
  if (!to) return;
  const today = await prisma.errorReport.count({ where: { alertedAt: { gte: new Date(Date.now() - ALERT_EVERY_MS) } } });
  if (today >= MAX_ALERTS_PER_DAY) return;
  // Mark first, so two requests hitting the same bug at once send one email.
  const claimed = await prisma.errorReport.updateMany({ where: { id: row.id, OR: [{ alertedAt: null }, { alertedAt: { lt: new Date(Date.now() - (row.returned ? 0 : ALERT_EVERY_MS)) } }] }, data: { alertedAt: new Date() } });
  if (!claimed.count) return;
  const label = { server: "Server", web: "Website", app: "Android app" }[row.source] ?? row.source;
  await sendEmail({
    to,
    subject: `${row.returned ? "Back again" : row.count > 1 ? "Still happening" : "New error"} in Tripanize (${label}): ${row.message.slice(0, 80)}`,
    text: [
      `${label} error${row.returned ? " that was marked fixed has come back" : ""}.`,
      "",
      `Message: ${row.message}`,
      row.where ? `Where: ${row.where}` : "",
      row.appVersion ? `App version: ${row.appVersion}` : "",
      `Seen ${row.count} time${row.count === 1 ? "" : "s"} since ${row.firstSeenAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
      "",
      row.stack ? `Details:\n${row.stack.slice(0, 1500)}` : "",
      "",
      "See all errors on your company dashboard: https://www.tripanize.app/company#errors",
    ].filter(line => line !== null).join("\n"),
  }).catch(() => undefined);
}

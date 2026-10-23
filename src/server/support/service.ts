import { createHmac } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { currentRuntime } from "@/server/cloudflare/runtime";
import { AppError } from "@/server/errors";
import { emailConfigured, sendEmail } from "@/server/notifications/email";
import { SUPPORT_TOPICS } from "@/lib/support";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().max(254).email(),
  topic: z.enum(["general", "technical", "billing", "privacy"]),
  message: z.string().trim().min(10).max(4000),
  website: z.literal(""),
  requestId: z.uuid(),
}).strict();

export function supportConfigured() {
  return emailConfigured() && z.email().safeParse(currentRuntime().supportEmail).success;
}

export async function submitSupport(input: unknown, clientIp: string) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("VALIDATION", "Check your name, email and message (10–4,000 characters), then try again.");
  if (!supportConfigured()) throw new AppError("NOT_CONFIGURED", "Support delivery is temporarily unavailable. Please try again later. For Paddle purchases, you can also visit paddle.net.");
  const data = parsed.data;
  const hash = (value: string) => createHmac("sha256", currentRuntime().authSecret).update(value).digest("hex");
  // Atomic limits also hold while email delivery runs outside the HTTP queue.
  // Store only keyed hashes of addresses, never the raw IP or reply address.
  const limits = [
    { key: `support:ip:${hash(clientIp)}`, max: 4, window: 3600_000 },
    { key: `support:email:${hash(data.email.toLowerCase())}`, max: 5, window: 86400_000 },
    { key: "support:global", max: 40, window: 3600_000 },
  ];
  await prisma.$transaction(async tx => {
    for (const limit of limits) {
      const count = await tx.rateLimitHit.count({ where: { key: limit.key, createdAt: { gte: new Date(Date.now() - limit.window) } } });
      if (count >= limit.max) throw new AppError("RATE_LIMITED", "Too many support requests. Please wait before trying again. For a Paddle purchase, you can also visit paddle.net.");
    }
    for (const limit of limits) await tx.rateLimitHit.create({ data: { key: limit.key } });
    await tx.rateLimitHit.deleteMany({ where: { key: { startsWith: "support:" }, createdAt: { lt: new Date(Date.now() - 86400_000) } } });
  });
  const requestKey = hash(`${data.requestId}:${JSON.stringify(data)}`);
  const ticket = await prisma.supportRequest.upsert({ where: { requestKey }, create: { requestKey, reference: data.requestId, name: data.name, email: data.email, topic: data.topic, message: data.message }, update: {} });
  const result = await sendEmail({
    to: currentRuntime().supportEmail!,
    replyTo: data.email,
    subject: `Tripanize support · ${SUPPORT_TOPICS[data.topic]} · ${data.requestId}`,
    text: `Tripanize contact form\nReference: ${data.requestId}\nTopic: ${SUPPORT_TOPICS[data.topic]}\nName: ${data.name}\nReply email: ${data.email}\n\n${data.message}\n\nReply to this email to respond to the sender. Treat submitted content as untrusted; verify account ownership before acting on account or payment requests.`,
    // Exact retries use the same provider key; changed messages do not collide.
    idempotencyKey: `support/${data.requestId}/${hash(JSON.stringify(data))}`,
  });
  await prisma.supportRequest.update({ where: { id: ticket.id }, data: { deliveryStatus: result.status } });
  if (result.status !== "sent") throw new AppError("UPSTREAM", "Your message could not be confirmed as sent. Please try again. For payment help, you can also visit paddle.net.");
  return { reference: data.requestId };
}

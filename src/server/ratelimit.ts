import { prisma } from "@/server/db";
import { AppError } from "@/server/errors";

/** Sliding-window limit stored in Postgres so it holds across server instances. */
export async function rateLimit(key: string, max: number, windowSec: number, message?: string) {
  const since = new Date(Date.now() - windowSec * 1000);
  const count = await prisma.rateLimitHit.count({ where: { key, createdAt: { gte: since } } });
  if (count >= max) {
    throw new AppError("RATE_LIMITED", message ?? "You're doing that a lot. Please wait a few minutes and try again.");
  }
  await prisma.rateLimitHit.create({ data: { key } });
  if (Math.random() < 0.02) await prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86400_000) } } });
}

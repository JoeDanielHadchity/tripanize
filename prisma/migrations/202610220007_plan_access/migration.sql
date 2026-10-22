ALTER TABLE "Trip" ADD COLUMN "normalAiDates" JSONB;

CREATE TABLE IF NOT EXISTS "PremiumEntitlement" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL,
  "validUntil" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PremiumEntitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

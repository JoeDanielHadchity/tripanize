ALTER TABLE "session" ADD COLUMN "adminEmailUnlockedAt" DATETIME;
CREATE TABLE "AdminEmailChallenge" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "challengeId" TEXT,
  "codeHash" TEXT,
  "sessionId" TEXT,
  "expiresAt" DATETIME,
  "requestedAt" DATETIME,
  "deliveredAt" DATETIME,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" DATETIME,
  CONSTRAINT "AdminEmailChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

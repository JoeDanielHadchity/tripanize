ALTER TABLE "session" ADD COLUMN "adminEmailVerifiedAt" DATETIME;
ALTER TABLE "session" ADD COLUMN "adminVerifiedUntil" DATETIME;
CREATE TABLE "AdminAuthenticator" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "encryptedSecret" TEXT,
  "enabledAt" DATETIME,
  "recoveryHashes" JSONB NOT NULL DEFAULT '[]',
  "lastCounter" INTEGER NOT NULL DEFAULT -1,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" DATETIME,
  "pendingSecret" TEXT,
  "pendingSessionId" TEXT,
  "pendingExpiresAt" DATETIME,
  CONSTRAINT "AdminAuthenticator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

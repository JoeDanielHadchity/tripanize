CREATE TABLE IF NOT EXISTS "TrialInvitation" (
  "id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL, "activeEmail" TEXT,
  "tokenHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL,
  "acceptedAt" DATETIME, "acceptedById" TEXT, "tripId" TEXT, "revokedAt" DATETIME,
  "emailText" TEXT NOT NULL, "emailStatus" TEXT NOT NULL DEFAULT 'queued',
  "emailAttempts" INTEGER NOT NULL DEFAULT 0, "firstEmailAttemptAt" DATETIME,
  "nextEmailAttemptAt" DATETIME, "emailSentAt" DATETIME, "emailProviderId" TEXT, "emailError" TEXT,
  FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY ("acceptedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TrialInvitation_activeEmail_key" ON "TrialInvitation"("activeEmail");
CREATE UNIQUE INDEX IF NOT EXISTS "TrialInvitation_tokenHash_key" ON "TrialInvitation"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "TrialInvitation_tripId_key" ON "TrialInvitation"("tripId");
CREATE INDEX IF NOT EXISTS "TrialInvitation_email_createdAt_idx" ON "TrialInvitation"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "TrialInvitation_emailStatus_nextEmailAttemptAt_idx" ON "TrialInvitation"("emailStatus", "nextEmailAttemptAt");

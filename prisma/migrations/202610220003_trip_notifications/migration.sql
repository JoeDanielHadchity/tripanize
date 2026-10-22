ALTER TABLE "NotificationPreference" ADD COLUMN "changeEmailEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TripNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "tripId" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "tripName" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "readAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "emailTo" TEXT,
  "emailSubject" TEXT,
  "emailText" TEXT,
  "emailStatus" TEXT NOT NULL DEFAULT 'disabled',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" DATETIME,
  "firstAttemptAt" DATETIME,
  "providerId" TEXT,
  "error" TEXT,
  CONSTRAINT "TripNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TripNotification_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TripNotification_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditLog"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TripNotification_userId_auditId_key" ON "TripNotification"("userId", "auditId");
CREATE INDEX "TripNotification_userId_createdAt_id_idx" ON "TripNotification"("userId", "createdAt", "id");
CREATE INDEX "TripNotification_emailStatus_nextAttemptAt_idx" ON "TripNotification"("emailStatus", "nextAttemptAt");

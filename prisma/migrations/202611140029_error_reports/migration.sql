CREATE TABLE "ErrorReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "where" TEXT,
    "appVersion" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUserId" TEXT,
    "alertedAt" DATETIME,
    "resolvedAt" DATETIME
);
CREATE UNIQUE INDEX "ErrorReport_fingerprint_key" ON "ErrorReport"("fingerprint");
CREATE INDEX "ErrorReport_resolvedAt_lastSeenAt_idx" ON "ErrorReport"("resolvedAt", "lastSeenAt");

CREATE TABLE IF NOT EXISTS "DestinationSearch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "result" JSONB,
  "error" TEXT,
  "selectedTripId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  CONSTRAINT "DestinationSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "DestinationSearch_userId_createdAt_idx" ON "DestinationSearch"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "DestinationSearch_status_createdAt_idx" ON "DestinationSearch"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "MemberLocation" (
  "membershipId" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 0,
  "sessionId" TEXT,
  "leaseHash" TEXT,
  "lat" REAL,
  "lng" REAL,
  "accuracy" REAL,
  "capturedAt" DATETIME,
  "updatedAt" DATETIME,
  "expiresAt" DATETIME,
  CONSTRAINT "MemberLocation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TripMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "MemberLocation_expiresAt_idx" ON "MemberLocation"("expiresAt");

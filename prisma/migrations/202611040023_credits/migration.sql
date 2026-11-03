-- Credits: an entry per addition or spend, and holds for AI actions in progress.
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "tripId" TEXT,
    "holdId" TEXT,
    "dedupeKey" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CreditEntry_holdId_key" ON "CreditEntry"("holdId");
CREATE UNIQUE INDEX "CreditEntry_dedupeKey_key" ON "CreditEntry"("dedupeKey");
CREATE INDEX "CreditEntry_userId_createdAt_idx" ON "CreditEntry"("userId", "createdAt");

CREATE TABLE "CreditHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "tripId" TEXT,
    "action" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "refKind" TEXT NOT NULL,
    "refId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'held',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" DATETIME,
    CONSTRAINT "CreditHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CreditHold_userId_status_idx" ON "CreditHold"("userId", "status");
CREATE INDEX "CreditHold_refKind_refId_idx" ON "CreditHold"("refKind", "refId");

ALTER TABLE "Trip" ADD COLUMN "membersUseCredits" BOOLEAN NOT NULL DEFAULT true;

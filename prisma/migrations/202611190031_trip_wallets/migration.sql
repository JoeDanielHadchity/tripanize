-- Trip wallets: credits that belong to one Premium trip. Unlocking Premium with credits, or paying for
-- Premium, puts 100 credits in the trip's wallet; AI on that trip is paid from it. When it runs out the
-- organizer is asked to move credits over from their account balance (never automatic).
ALTER TABLE "CreditHold" ADD COLUMN "wallet" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "TripCreditEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "userId" TEXT,
    "holdId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "TripCreditEntry_holdId_key" ON "TripCreditEntry"("holdId");
CREATE UNIQUE INDEX "TripCreditEntry_dedupeKey_key" ON "TripCreditEntry"("dedupeKey");
CREATE INDEX "TripCreditEntry_tripId_createdAt_idx" ON "TripCreditEntry"("tripId", "createdAt");

-- Trips already unlocked with credits: their 100 credits become the trip's wallet...
INSERT INTO "TripCreditEntry" ("id", "tripId", "amount", "kind", "note", "userId", "dedupeKey", "createdAt")
  SELECT 'tw' || lower(hex(randomblob(11))), "tripId", "credits", 'unlock', 'Premium unlocked with credits', "userId", 'unlock:' || "tripId", "createdAt" FROM "PremiumUnlock";
UPDATE "CreditEntry" SET "kind" = 'transfer' WHERE "kind" = 'spend' AND "note" = 'premium';
-- ...and AI already charged to the organizer's balance on those trips is paid from the wallet instead,
-- with the same credits given back to the balance.
INSERT INTO "TripCreditEntry" ("id", "tripId", "amount", "kind", "note", "userId", "dedupeKey", "createdAt")
  SELECT 'tw' || lower(hex(randomblob(11))), e."tripId", e."amount", 'spend', e."note", e."createdById", 'moved:' || e."id", e."createdAt"
  FROM "CreditEntry" e JOIN "PremiumUnlock" u ON u."tripId" = e."tripId" AND u."userId" = e."userId"
  WHERE e."kind" = 'spend' AND e."createdAt" >= u."createdAt";
INSERT INTO "CreditEntry" ("id", "userId", "amount", "kind", "note", "tripId", "dedupeKey", "createdAt")
  SELECT 'tw' || lower(hex(randomblob(11))), e."userId", -e."amount", 'adjust', 'Given back: paid from the trip''s credits', e."tripId", 'moved:' || e."id", e."createdAt"
  FROM "CreditEntry" e JOIN "PremiumUnlock" u ON u."tripId" = e."tripId" AND u."userId" = e."userId"
  WHERE e."kind" = 'spend' AND e."createdAt" >= u."createdAt";

CREATE TABLE IF NOT EXISTS "PremiumCheckout" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "tripId" TEXT NOT NULL REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "buyerId" TEXT NOT NULL,
 "environment" TEXT NOT NULL,
 "priceId" TEXT NOT NULL,
 "amountMinor" INTEGER NOT NULL,
 "targetCapacity" INTEGER NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'CREATING',
 "transactionId" TEXT,
 "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "PremiumCheckout_transactionId_key" ON "PremiumCheckout"("transactionId");
CREATE INDEX IF NOT EXISTS "PremiumCheckout_tripId_environment_status_idx" ON "PremiumCheckout"("tripId", "environment", "status");

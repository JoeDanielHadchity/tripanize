CREATE TABLE "CreditCheckout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "buyerId" TEXT NOT NULL,
    "bundle" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "tripId" TEXT,
    "environment" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "transactionId" TEXT,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "paddleSummary" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "CreditCheckout_transactionId_key" ON "CreditCheckout"("transactionId");
CREATE INDEX "CreditCheckout_buyerId_environment_status_idx" ON "CreditCheckout"("buyerId", "environment", "status");
CREATE INDEX "CreditCheckout_tripId_environment_status_idx" ON "CreditCheckout"("tripId", "environment", "status");

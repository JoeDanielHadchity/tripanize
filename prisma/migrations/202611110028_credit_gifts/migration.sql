CREATE TABLE "CreditGift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedById" TEXT,
    "claimedAt" DATETIME
);
CREATE INDEX "CreditGift_email_claimedAt_idx" ON "CreditGift"("email", "claimedAt");

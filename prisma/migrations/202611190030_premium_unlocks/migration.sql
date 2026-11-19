-- Premium for a trip paid with account credits instead of money (one per trip).
CREATE TABLE "PremiumUnlock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "PremiumUnlock_tripId_key" ON "PremiumUnlock"("tripId");
CREATE INDEX "PremiumUnlock_userId_idx" ON "PremiumUnlock"("userId");

-- AlterTable
ALTER TABLE "user" ADD COLUMN "lastSeenAt" DATETIME;
ALTER TABLE "user" ADD COLUMN "suspendedAt" DATETIME;
ALTER TABLE "user" ADD COLUMN "suspensionReason" TEXT;

-- AlterTable
ALTER TABLE "TrialInvitation" ADD COLUMN "durationDays" INTEGER DEFAULT 14;
ALTER TABLE "TrialInvitation" ADD COLUMN "trialEndsAt" DATETIME;

-- AlterTable
ALTER TABLE "PremiumCheckout" ADD COLUMN "paddleSummary" JSONB;

-- CreateTable
CREATE TABLE "AdminAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "aiPaused" BOOLEAN NOT NULL DEFAULT false,
    "aiDailyLimit" INTEGER,
    "aiUserDailyLimit" INTEGER,
    "pricingModel" TEXT,
    "inputUsdPerMillion" REAL,
    "outputUsdPerMillion" REAL,
    "searchUsdPerThousand" REAL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "tripId" TEXT,
    "jobId" TEXT,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "searchCalls" INTEGER,
    "estimatedCostMicros" INTEGER,
    "errorCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestKey" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "note" TEXT NOT NULL DEFAULT '',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'info',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BillingDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "transactionId" TEXT,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AdminAudit_createdAt_id_idx" ON "AdminAudit"("createdAt", "id");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AiUsage_userId_createdAt_idx" ON "AiUsage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportRequest_requestKey_key" ON "SupportRequest"("requestKey");

-- CreateIndex
CREATE INDEX "SupportRequest_status_createdAt_idx" ON "SupportRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_status_startsAt_idx" ON "Announcement"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingDelivery_eventId_key" ON "BillingDelivery"("eventId");

-- CreateIndex
CREATE INDEX "BillingDelivery_environment_createdAt_idx" ON "BillingDelivery"("environment", "createdAt");


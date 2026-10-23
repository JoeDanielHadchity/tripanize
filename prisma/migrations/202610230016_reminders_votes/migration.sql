-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "bookByAt" TEXT;
ALTER TABLE "Booking" ADD COLUMN "freeCancellationAt" TEXT;
ALTER TABLE "Booking" ADD COLUMN "paymentDueAt" TEXT;

-- CreateTable
CREATE TABLE "TripPoll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "chosenOptionId" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripPoll_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "TripPoll" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "NotificationPreference" ADD COLUMN "bookingReminderEmailEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "TripPoll_tripId_createdAt_idx" ON "TripPoll"("tripId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TripVote_pollId_userId_key" ON "TripVote"("pollId", "userId");


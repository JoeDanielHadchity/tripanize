ALTER TABLE "Trip" ADD COLUMN "chatSeq" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Trip" ADD COLUMN "chatRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TripMembership" ADD COLUMN "chatReadSeq" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tripId" TEXT NOT NULL,
  "senderId" TEXT,
  "senderName" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "revision" INTEGER NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" DATETIME,
  CONSTRAINT "ChatMessage_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChatMessage_tripId_seq_key" ON "ChatMessage"("tripId", "seq");
CREATE UNIQUE INDEX "ChatMessage_tripId_senderId_clientId_key" ON "ChatMessage"("tripId", "senderId", "clientId");
CREATE INDEX "ChatMessage_tripId_revision_idx" ON "ChatMessage"("tripId", "revision");
CREATE INDEX "ChatMessage_tripId_senderId_createdAt_idx" ON "ChatMessage"("tripId", "senderId", "createdAt");

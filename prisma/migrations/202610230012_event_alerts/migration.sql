ALTER TABLE "TripNotification" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'change';
-- Enable the new default for trips whose organizer never chose discovery settings.
-- Explicit pauses remain respected. Only verified Premium trips will be searched.
UPDATE "Trip" SET "autoDiscovery" = true, "nextDiscoveryAt" = NULL
WHERE "autoDiscovery" = false
AND NOT EXISTS (SELECT 1 FROM "AuditLog" WHERE "AuditLog"."tripId" = "Trip"."id" AND "entity" = 'discovery');

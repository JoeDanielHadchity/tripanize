ALTER TABLE "DestinationSearch" ADD COLUMN "number" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DestinationSearch" ADD COLUMN "queuedAt" DATETIME;
UPDATE "DestinationSearch" SET "number" = (
  SELECT count(*) FROM "DestinationSearch" AS previous
  WHERE previous."userId" = "DestinationSearch"."userId" AND
    (previous."createdAt" < "DestinationSearch"."createdAt" OR
      (previous."createdAt" = "DestinationSearch"."createdAt" AND previous."id" <= "DestinationSearch"."id"))
);
UPDATE "DestinationSearch" SET "queuedAt" = "createdAt";
CREATE UNIQUE INDEX "DestinationSearch_userId_number_key" ON "DestinationSearch"("userId", "number");

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Profile" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "homeCity" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "pace" TEXT NOT NULL DEFAULT 'BALANCED',
    "interests" JSONB NOT NULL DEFAULT [],
    "dietary" TEXT,
    "accessibility" TEXT,
    "mapsApp" TEXT NOT NULL DEFAULT 'GOOGLE',
    "timezone" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TEXT,
    "endDate" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "budgetMinor" INTEGER,
    "pace" TEXT NOT NULL DEFAULT 'BALANCED',
    "interests" JSONB NOT NULL DEFAULT [],
    "transport" JSONB NOT NULL DEFAULT [],
    "accessibility" TEXT,
    "preferences" TEXT,
    "dietary" TEXT,
    "restaurantPrefs" TEXT,
    "departureCity" TEXT,
    "arrivalLocation" TEXT,
    "arrivalAt" TEXT,
    "departureLocation" TEXT,
    "departureAt" TEXT,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "isRoadTrip" BOOLEAN NOT NULL DEFAULT false,
    "carPickupLocation" TEXT,
    "carPickupAt" TEXT,
    "carReturnLocation" TEXT,
    "carReturnAt" TEXT,
    "notes" TEXT,
    "imageUrl" TEXT,
    "imageCredit" TEXT,
    "imagePageUrl" TEXT,
    "copiedFromExample" TEXT,
    "planQuestions" JSONB,
    "planPrefs" JSONB,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "lastChangedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "autoDiscovery" BOOLEAN NOT NULL DEFAULT false,
    "discoveryEveryHours" INTEGER NOT NULL DEFAULT 24,
    "nextDiscoveryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Trip_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "travelerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripMembership_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripMembership_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Traveler" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isChild" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "leftAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Traveler_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Traveler_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT NOT NULL,
    "travelerId" TEXT,
    "createdById" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "acceptedAt" DATETIME,
    "acceptedById" TEXT,
    "emailStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invitation_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invitation_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "lat" REAL,
    "lng" REAL,
    "timezone" TEXT,
    "arriveDate" TEXT,
    "departDate" TEXT,
    "accommodationName" TEXT,
    "accommodationAddress" TEXT,
    "neighborhood" TEXT,
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "parkingNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Destination_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripPlace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    CONSTRAINT "TripPlace_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItineraryDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "destinationId" TEXT,
    "title" TEXT,
    "area" TEXT,
    "notes" TEXT,
    "questions" JSONB NOT NULL DEFAULT [],
    "isTravelDay" BOOLEAN NOT NULL DEFAULT false,
    "driveMinutes" INTEGER,
    "activePlan" TEXT NOT NULL DEFAULT 'A',
    "planBNote" TEXT,
    "estCostMinor" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ItineraryDay_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItineraryDay_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Stop" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "dayId" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'A',
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'sight',
    "locationName" TEXT,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "reason" TEXT,
    "startTime" TEXT,
    "durationMin" INTEGER,
    "travelToNextMin" INTEGER,
    "travelMode" TEXT,
    "travelNote" TEXT,
    "officialUrl" TEXT,
    "sourceUrls" JSONB NOT NULL DEFAULT [],
    "estCostMinor" INTEGER,
    "currency" TEXT,
    "bookingRequired" BOOLEAN NOT NULL DEFAULT false,
    "bookingNote" TEXT,
    "hoursNote" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "isMeal" BOOLEAN NOT NULL DEFAULT false,
    "isFreeTime" BOOLEAN NOT NULL DEFAULT false,
    "indoor" BOOLEAN,
    "origin" TEXT NOT NULL DEFAULT 'MANUAL',
    "bookingId" TEXT,
    "eventId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stop_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stop_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ItineraryDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Stop_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stop_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TripEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItineraryVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItineraryVersion_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "date" TEXT,
    "startTime" TEXT,
    "endDate" TEXT,
    "durationMin" INTEGER,
    "guests" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IDEA',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "whenToBook" TEXT,
    "estCostMinor" INTEGER,
    "finalCostMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "ticketType" TEXT,
    "preferences" TEXT,
    "address" TEXT,
    "bookingUrl" TEXT,
    "confirmationRef" TEXT,
    "notes" TEXT,
    "cancellationTerms" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Booking_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "bookingId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "payerId" TEXT NOT NULL,
    "splitMethod" TEXT NOT NULL,
    "notes" TEXT,
    "bookingId" TEXT,
    "convCurrency" TEXT,
    "convRate" TEXT,
    "convRateDate" TEXT,
    "convAmountMinor" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Expense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "Traveler" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Expense_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expenseId" TEXT NOT NULL,
    "travelerId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "percentBp" INTEGER,
    CONSTRAINT "ExpenseShare_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseShare_travelerId_fkey" FOREIGN KEY ("travelerId") REFERENCES "Traveler" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "Settlement_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Settlement_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Traveler" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Settlement_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Traveler" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PackingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "ownerId" TEXT,
    "listKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'user',
    "reason" TEXT,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PackingItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackingItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "dueDate" TEXT,
    "assigneeId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TripTask_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TripTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Traveler" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TripEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "date" TEXT,
    "startTime" TEXT,
    "endDate" TEXT,
    "dateVerified" BOOLEAN NOT NULL DEFAULT false,
    "venue" TEXT,
    "city" TEXT,
    "address" TEXT,
    "officialUrl" TEXT,
    "bookingUrl" TEXT,
    "priceText" TEXT,
    "availability" TEXT,
    "bookingDeadline" TEXT,
    "whyFits" TEXT,
    "uncertainty" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "soldOut" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "origin" TEXT NOT NULL DEFAULT 'discovered',
    "lastCheckedAt" DATETIME,
    "changes" JSONB,
    "changeHash" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TripEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "retrievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSource_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TripEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscoveryRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "found" INTEGER NOT NULL DEFAULT 0,
    "added" INTEGER NOT NULL DEFAULT 0,
    "changed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "DiscoveryRun_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" JSONB NOT NULL DEFAULT [],
    "proposal" JSONB,
    "checks" JSONB,
    "error" TEXT,
    "errorCode" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" DATETIME,
    "appliedDates" JSONB NOT NULL DEFAULT [],
    "requestedById" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    CONSTRAINT "GenerationJob_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" TEXT NOT NULL DEFAULT 'immediate',
    "changeTypes" JSONB NOT NULL DEFAULT [],
    "lastDigestAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationPreference_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tripId" TEXT,
    "channel" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotificationDelivery_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tripId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExternalCache" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" JSONB NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "TripMembership_travelerId_key" ON "TripMembership"("travelerId");

-- CreateIndex
CREATE INDEX "TripMembership_userId_idx" ON "TripMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TripMembership_tripId_userId_key" ON "TripMembership"("tripId", "userId");

-- CreateIndex
CREATE INDEX "Traveler_tripId_idx" ON "Traveler"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Traveler_tripId_userId_key" ON "Traveler"("tripId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_tripId_idx" ON "Invitation"("tripId");

-- CreateIndex
CREATE INDEX "Destination_tripId_idx" ON "Destination"("tripId");

-- CreateIndex
CREATE INDEX "TripPlace_tripId_idx" ON "TripPlace"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "ItineraryDay_tripId_date_key" ON "ItineraryDay"("tripId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Stop_bookingId_key" ON "Stop"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Stop_eventId_key" ON "Stop"("eventId");

-- CreateIndex
CREATE INDEX "Stop_tripId_dayId_idx" ON "Stop"("tripId", "dayId");

-- CreateIndex
CREATE INDEX "ItineraryVersion_tripId_createdAt_idx" ON "ItineraryVersion"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_tripId_idx" ON "Booking"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Expense_tripId_idx" ON "Expense"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseShare_expenseId_travelerId_key" ON "ExpenseShare"("expenseId", "travelerId");

-- CreateIndex
CREATE INDEX "Settlement_tripId_idx" ON "Settlement"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "PackingItem_tripId_listKey_normKey_key" ON "PackingItem"("tripId", "listKey", "normKey");

-- CreateIndex
CREATE UNIQUE INDEX "TripEvent_tripId_dedupeKey_key" ON "TripEvent"("tripId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "EventSource_eventId_url_key" ON "EventSource"("eventId", "url");

-- CreateIndex
CREATE INDEX "DiscoveryRun_tripId_createdAt_idx" ON "DiscoveryRun"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_tripId_createdAt_idx" ON "GenerationJob"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_status_createdAt_idx" ON "GenerationJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_tripId_key" ON "NotificationPreference"("userId", "tripId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_userId_dedupeKey_key" ON "NotificationDelivery"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "AuditLog_tripId_entity_entityId_idx" ON "AuditLog"("tripId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "RateLimitHit_key_createdAt_idx" ON "RateLimitHit"("key", "createdAt");

-- Keep each event linked to at most one canonical booking.
ALTER TABLE "Booking" ADD COLUMN "eventId" TEXT REFERENCES "TripEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Booking_eventId_key" ON "Booking"("eventId");

ALTER TABLE "Attachment" ADD COLUMN "expenseId" TEXT REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "Attachment_expenseId_idx" ON "Attachment"("expenseId");

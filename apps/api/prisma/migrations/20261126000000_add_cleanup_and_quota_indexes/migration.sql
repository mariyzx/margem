-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "MagicLinkToken_usedAt_idx" ON "MagicLinkToken"("usedAt");

-- CreateIndex
CREATE INDEX "Question_authorId_deleted_date_idx" ON "Question"("authorId", "deleted_date");


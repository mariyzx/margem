-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ipHash" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_ipHash_createdAt_idx" ON "AuditLog"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");


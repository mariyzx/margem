-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('file', 'link', 'text');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('queued', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "storageKey" TEXT,
    "url" TEXT,
    "status" "SourceStatus" NOT NULL DEFAULT 'ready',
    "failureReason" TEXT,
    "deleted_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Source_notebookId_deleted_date_updatedAt_idx" ON "Source"("notebookId", "deleted_date", "updatedAt");

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

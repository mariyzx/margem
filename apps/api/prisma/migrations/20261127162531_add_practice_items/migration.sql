-- CreateEnum
CREATE TYPE "PracticeKind" AS ENUM ('quiz', 'flashcard', 'cloze', 'why');

-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('pending', 'approved', 'discarded');

-- CreateEnum
CREATE TYPE "PracticeAuthor" AS ENUM ('self', 'ai');

-- CreateTable
CREATE TABLE "PracticeItem" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceChunkId" TEXT,
    "kind" "PracticeKind" NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdBy" "PracticeAuthor" NOT NULL DEFAULT 'ai',
    "status" "PracticeStatus" NOT NULL DEFAULT 'pending',
    "deleted_date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PracticeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeItem_sourceId_status_deleted_date_idx" ON "PracticeItem"("sourceId", "status", "deleted_date");

-- CreateIndex
CREATE INDEX "PracticeItem_notebookId_deleted_date_idx" ON "PracticeItem"("notebookId", "deleted_date");

-- CreateIndex
CREATE INDEX "PracticeItem_sourceChunkId_idx" ON "PracticeItem"("sourceChunkId");

-- AddForeignKey
ALTER TABLE "PracticeItem" ADD CONSTRAINT "PracticeItem_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeItem" ADD CONSTRAINT "PracticeItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeItem" ADD CONSTRAINT "PracticeItem_sourceChunkId_fkey" FOREIGN KEY ("sourceChunkId") REFERENCES "SourceChunk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

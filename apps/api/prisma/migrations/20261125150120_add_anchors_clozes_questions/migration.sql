-- CreateEnum
CREATE TYPE "AnchorStatus" AS ENUM ('active', 'orphaned');

-- CreateEnum
CREATE TYPE "QuestionAuthorType" AS ENUM ('self', 'group', 'ai');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('pending', 'approved', 'discarded');

-- CreateTable
CREATE TABLE "Anchor" (
    "id" TEXT NOT NULL,
    "noteId" TEXT,
    "blockId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "status" "AnchorStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_date" TIMESTAMP(3),

    CONSTRAINT "Anchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cloze" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "anchorId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_date" TIMESTAMP(3),

    CONSTRAINT "Cloze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "anchorId" TEXT,
    "authorType" "QuestionAuthorType" NOT NULL DEFAULT 'self',
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'approved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_date" TIMESTAMP(3),

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Anchor_noteId_deleted_date_idx" ON "Anchor"("noteId", "deleted_date");

-- CreateIndex
CREATE INDEX "Cloze_noteId_deleted_date_idx" ON "Cloze"("noteId", "deleted_date");

-- CreateIndex
CREATE INDEX "Question_noteId_deleted_date_createdAt_idx" ON "Question"("noteId", "deleted_date", "createdAt");

-- AddForeignKey
ALTER TABLE "Anchor" ADD CONSTRAINT "Anchor_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cloze" ADD CONSTRAINT "Cloze_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cloze" ADD CONSTRAINT "Cloze_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "Anchor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_anchorId_fkey" FOREIGN KEY ("anchorId") REFERENCES "Anchor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

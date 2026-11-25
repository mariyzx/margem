-- CreateEnum
CREATE TYPE "NotebookColor" AS ENUM ('bic', 'correct', 'turma', 'marker', 'ink');

-- CreateTable
CREATE TABLE "Notebook" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" "NotebookColor" NOT NULL DEFAULT 'bic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notebook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "doc" JSONB NOT NULL,
    "materialOpenedAt" TIMESTAMP(3),
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notebook_ownerId_updatedAt_idx" ON "Notebook"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_notebookId_updatedAt_idx" ON "Note"("notebookId", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_authorId_updatedAt_idx" ON "Note"("authorId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Notebook" ADD CONSTRAINT "Notebook_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "Note_authorId_updatedAt_idx";

-- DropIndex
DROP INDEX "Note_notebookId_updatedAt_idx";

-- DropIndex
DROP INDEX "Notebook_ownerId_updatedAt_idx";

-- AlterTable
ALTER TABLE "Note" ADD COLUMN     "deleted_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notebook" ADD COLUMN     "deleted_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deleted_date" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Note_notebookId_deleted_date_updatedAt_idx" ON "Note"("notebookId", "deleted_date", "updatedAt");

-- CreateIndex
CREATE INDEX "Note_authorId_deleted_date_updatedAt_idx" ON "Note"("authorId", "deleted_date", "updatedAt");

-- CreateIndex
CREATE INDEX "Notebook_ownerId_deleted_date_updatedAt_idx" ON "Notebook"("ownerId", "deleted_date", "updatedAt");

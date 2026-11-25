-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "page" INTEGER,
    "startSec" INTEGER,
    "endSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceChunk_sourceId_idx" ON "SourceChunk"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceChunk_sourceId_ord_key" ON "SourceChunk"("sourceId", "ord");

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

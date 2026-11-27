import type { PracticeItemDto } from "@margem/shared";
import type { PracticeItem } from "@prisma/client";

export function toPracticeDto(item: PracticeItem): PracticeItemDto {
  return {
    id: item.id,
    notebookId: item.notebookId,
    sourceId: item.sourceId,
    sourceChunkId: item.sourceChunkId,
    kind: item.kind,
    prompt: item.prompt,
    answer: item.answer,
    createdBy: item.createdBy,
    status: item.status,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

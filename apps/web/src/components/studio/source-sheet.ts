import type { PracticeItemDto, SourceChunkDto } from "@margem/shared";

export type SourceSheet =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; chunks: SourceChunkDto[]; truncated: boolean; practice: PracticeItemDto[] };

export type SheetCache = Record<string, SourceSheet>;

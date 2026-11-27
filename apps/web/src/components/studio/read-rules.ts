import type { AskNotebookResultDto, PracticeItemDto, PracticeKind } from "@margem/shared";

export interface ChunkPractice {
  byChunk: Map<string, PracticeItemDto[]>;
  unplaced: PracticeItemDto[];
}

export function practiceByChunk(
  items: PracticeItemDto[],
  kind: PracticeKind,
  chunkIds: ReadonlySet<string>,
): ChunkPractice {
  const byChunk = new Map<string, PracticeItemDto[]>();
  const unplaced: PracticeItemDto[] = [];
  for (const item of items) {
    if (item.kind !== kind) continue;
    if (!item.sourceChunkId || !chunkIds.has(item.sourceChunkId)) {
      unplaced.push(item);
      continue;
    }
    const list = byChunk.get(item.sourceChunkId) ?? [];
    list.push(item);
    byChunk.set(item.sourceChunkId, list);
  }
  return { byChunk, unplaced };
}

export type TextSegment = { text: string } | { text: string; blankId: string };

export function splitBlanks(
  text: string,
  blanks: Array<{ id: string; answer: string }>,
): TextSegment[] {
  const ranges: Array<{ start: number; end: number; id: string }> = [];
  for (const blank of blanks) {
    const answer = blank.answer.trim();
    if (!answer) continue;
    let from = 0;
    while (from <= text.length) {
      const start = text.indexOf(answer, from);
      if (start === -1) break;
      const end = start + answer.length;
      const overlaps = ranges.some((range) => start < range.end && end > range.start);
      if (!overlaps) {
        ranges.push({ start, end, id: blank.id });
        break;
      }
      from = start + 1;
    }
  }
  ranges.sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start) });
    segments.push({ text: text.slice(range.start, range.end), blankId: range.id });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}

export function answerChunkId(
  asked: AskNotebookResultDto | null,
  chunkIds: ReadonlySet<string>,
): string | null {
  if (!asked?.found) return null;
  const cited = asked.citations.find(
    (citation) => citation.kind === "chunk" && chunkIds.has(citation.id),
  );
  return cited?.id ?? null;
}

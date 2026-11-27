import type { QuestionDto } from "@margem/shared";

export function toQuestionDto(question: {
  id: string;
  noteId: string;
  anchorId: string | null;
  authorType: QuestionDto["authorType"];
  authorId: string | null;
  text: string;
  answer: string;
  status: QuestionDto["status"];
  anchor: {
    id: string;
    noteId: string | null;
    blockId: string;
    quote: string;
    prefix: string;
    suffix: string;
    status: "active" | "orphaned";
  } | null;
  createdAt: Date;
  updatedAt: Date;
}): QuestionDto {
  return {
    id: question.id,
    noteId: question.noteId,
    anchorId: question.anchorId,
    authorType: question.authorType,
    authorId: question.authorId,
    text: question.text,
    answer: question.answer,
    status: question.status,
    anchor: question.anchor
      ? {
          id: question.anchor.id,
          noteId: question.anchor.noteId,
          blockId: question.anchor.blockId,
          quote: question.anchor.quote,
          prefix: question.anchor.prefix,
          suffix: question.anchor.suffix,
          status: question.anchor.status,
        }
      : null,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

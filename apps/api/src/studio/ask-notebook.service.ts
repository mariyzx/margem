import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { AskCitationDto, AskNotebookInput, AskNotebookResultDto } from "@margem/shared";
import { AiService } from "../ai/ai.service";
import { takeWithinBudget } from "../ai/prompt";
import {
  type AskContextItem,
  askNotebookOutputSchema,
  buildAskNotebookPrompt,
  MAX_ASK_CONTEXT_CHARS,
} from "../ai/prompts/ask-notebook";
import { PrismaService } from "../prisma/prisma.service";
import { type NotebookContext, NotebookContextService } from "../search/notebook-context.service";
import { groundAnswer, notFound } from "./ground-answer";

const EXCERPT_CHARS = 220;
const NOTE_SHARE = 0.4;

@Injectable()
export class AskNotebookService {
  private readonly logger = new Logger(AskNotebookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly context: NotebookContextService,
  ) {}

  async ask(
    userId: string,
    notebookId: string,
    input: AskNotebookInput,
  ): Promise<AskNotebookResultDto> {
    const notebook = await this.prisma.notebook.findFirst({
      where: { id: notebookId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!notebook) throw new NotFoundException("Resource not found");
    await this.ai.assertEnabled(userId, "ask-notebook");

    const context = await this.context.gather({
      userId,
      notebookId,
      question: input.question,
      sourceIds: input.sourceIds,
    });
    const { items, citationsById } = toPromptContext(context);
    if (items.length === 0) {
      this.logger.log(
        { notebookId, retrieval: context.retrieval, found: false, reason: "no_context" },
        "ai.ask_notebook",
      );
      return notFound();
    }

    const { data, provider } = await this.ai.completeJson(
      userId,
      "ask-notebook",
      buildAskNotebookPrompt(input.question, items),
      askNotebookOutputSchema,
    );
    const result = groundAnswer(data, citationsById);

    this.logger.log(
      {
        notebookId,
        provider,
        retrieval: context.retrieval,
        contextItems: items.length,
        found: result.found,
        citations: result.citations.length,
        droppedCitations: data.citations.length - result.citations.length,
      },
      "ai.ask_notebook",
    );
    return result;
  }
}

function toPromptContext(context: NotebookContext): {
  items: AskContextItem[];
  citationsById: Map<string, AskCitationDto>;
} {
  const noteBudget = Math.floor(MAX_ASK_CONTEXT_CHARS * NOTE_SHARE);
  const noteTexts = takeWithinBudget(
    context.noteBlocks.map((block) => block.text),
    noteBudget,
  );
  const chunkTexts = takeWithinBudget(
    context.chunks.map((chunk) => chunk.text),
    MAX_ASK_CONTEXT_CHARS - noteTexts.join("").length,
  );

  const items: AskContextItem[] = [];
  const citationsById = new Map<string, AskCitationDto>();

  chunkTexts.forEach((text, index) => {
    const chunk = context.chunks[index]!;
    const id = `t${index + 1}`;
    items.push({ id, label: "trecho da fonte", text });
    citationsById.set(id, {
      kind: "chunk",
      id: chunk.id,
      title: chunk.title,
      excerpt: excerptOf(chunk.text),
      sourceId: chunk.sourceId,
      noteId: null,
      blockId: null,
      page: chunk.page,
    });
  });

  noteTexts.forEach((text, index) => {
    const block = context.noteBlocks[index]!;
    const id = `n${index + 1}`;
    items.push({ id, label: "nota da pessoa", text });
    citationsById.set(id, {
      kind: "note",
      id: `${block.noteId}:${block.blockId}`,
      title: block.title,
      excerpt: excerptOf(block.text),
      sourceId: null,
      noteId: block.noteId,
      blockId: block.blockId,
      page: null,
    });
  });

  return { items, citationsById };
}

function excerptOf(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= EXCERPT_CHARS ? clean : `${clean.slice(0, EXCERPT_CHARS - 1)}…`;
}

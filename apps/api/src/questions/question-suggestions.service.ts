import { Injectable, Logger } from "@nestjs/common";
import {
  createQuestionSchema,
  extractNoteBlocks,
  type NoteBlockText,
  type QuestionSuggestionsDto,
} from "@margem/shared";
import { AiService } from "../ai/ai.service";
import {
  buildSuggestClozesQuestionsPrompt,
  fitBlocksToBudget,
  MAX_SUGGESTED_CLOZES,
  MAX_SUGGESTED_QUESTIONS,
  suggestClozesQuestionsOutputSchema,
  type SuggestClozesQuestionsOutput,
} from "../ai/prompts/suggest-clozes-questions";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertWithinQuota, quotaLimit } from "../quotas/quota";
import { withAuditContext } from "../security/request-context";
import { toQuestionDto } from "./question-dto";

const ANCHOR_CONTEXT_CHARS = 32;
const MAX_QUOTE_CHARS = 200;

interface GroundedCloze {
  blockId: string;
  quote: string;
}

interface GroundedQuestion extends GroundedCloze {
  text: string;
  answer: string;
  prefix: string;
  suffix: string;
}

@Injectable()
export class QuestionSuggestionsService {
  private readonly logger = new Logger(QuestionSuggestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
    private readonly ai: AiService,
  ) {}

  async suggest(userId: string, noteId: string): Promise<QuestionSuggestionsDto> {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: { authorId: true, doc: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, note?.deletedAt ? null : note?.authorId);

    const blocks = fitBlocksToBudget(
      extractNoteBlocks((note!.doc ?? {}) as Record<string, unknown>),
    );
    if (blocks.length === 0) {
      return { clozes: [], questions: [] };
    }

    const owned = await this.prisma.question.count({
      where: { authorId: userId, deletedAt: null, note: { deletedAt: null } },
    });
    assertWithinQuota("questions", owned);

    const promptBlocks = blocks.map((block, index) => ({ ...block, blockId: `b${index + 1}` }));
    const realBlockId = new Map(
      promptBlocks.map((block, index) => [block.blockId, blocks[index]!.blockId]),
    );
    const { data, provider } = await this.ai.completeJson(
      userId,
      "suggest-clozes-questions",
      buildSuggestClozesQuestionsPrompt(promptBlocks),
      suggestClozesQuestionsOutputSchema,
    );
    const shortGrounded = groundSuggestions(data, promptBlocks);
    const grounded = {
      clozes: shortGrounded.clozes.map((cloze) => ({
        ...cloze,
        blockId: realBlockId.get(cloze.blockId)!,
      })),
      questions: shortGrounded.questions.map((question) => ({
        ...question,
        blockId: realBlockId.get(question.blockId)!,
      })),
    };
    const questions = grounded.questions.slice(0, quotaLimit("questions") - owned);

    const created = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const stale = await tx.question.findMany({
        where: { noteId, authorType: "ai", status: "pending", deletedAt: null },
        select: { id: true, anchorId: true },
      });
      if (stale.length > 0) {
        await tx.question.updateMany({
          where: { id: { in: stale.map((q) => q.id) } },
          data: { status: "discarded", deletedAt: now },
        });
        const anchorIds = stale.flatMap((q) => (q.anchorId ? [q.anchorId] : []));
        await tx.anchor.updateMany({ where: { id: { in: anchorIds } }, data: { deletedAt: now } });
      }

      const saved = [];
      for (const suggestion of questions) {
        const anchor = await tx.anchor.create({
          data: {
            noteId,
            blockId: suggestion.blockId,
            quote: suggestion.quote,
            prefix: suggestion.prefix,
            suffix: suggestion.suffix,
            status: "active",
          },
        });
        saved.push(
          await tx.question.create({
            data: {
              noteId,
              anchorId: anchor.id,
              authorType: "ai",
              authorId: userId,
              text: suggestion.text,
              answer: suggestion.answer,
              status: "pending",
            },
            include: { anchor: true },
          }),
        );
      }

      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "question.suggested",
          metadata: {
            noteId,
            provider,
            questions: saved.length,
            clozes: grounded.clozes.length,
            replaced: stale.length,
          },
        }),
      });
      return saved;
    });

    this.logger.log(
      {
        noteId,
        provider,
        questions: created.length,
        clozes: grounded.clozes.length,
        dropped:
          data.questions.length + data.clozes.length - created.length - grounded.clozes.length,
      },
      "ai.suggestions_created",
    );

    return { clozes: grounded.clozes, questions: created.map(toQuestionDto) };
  }
}

export function groundSuggestions(
  output: SuggestClozesQuestionsOutput,
  blocks: NoteBlockText[],
): { clozes: GroundedCloze[]; questions: GroundedQuestion[] } {
  const textById = new Map(blocks.map((block) => [block.blockId, block.text]));
  const locateCloze = makeLocator(textById);
  const locateQuestion = makeLocator(textById);

  const clozes: GroundedCloze[] = [];
  for (const item of output.clozes) {
    if (clozes.length >= MAX_SUGGESTED_CLOZES) break;
    const found = locateCloze(item.blockId, item.quote);
    if (found) clozes.push({ blockId: found.blockId, quote: found.quote });
  }

  const questions: GroundedQuestion[] = [];
  for (const item of output.questions) {
    if (questions.length >= MAX_SUGGESTED_QUESTIONS) break;
    const fields = createQuestionSchema
      .pick({ text: true, answer: true })
      .safeParse({ text: item.text, answer: item.answer });
    if (!fields.success) continue;
    const found = locateQuestion(item.blockId, item.quote);
    if (found) questions.push({ ...found, ...fields.data });
  }

  return { clozes, questions };
}

function makeLocator(textById: Map<string, string>) {
  const seen = new Set<string>();
  return (blockId: string, rawQuote: string) => {
    const quote = rawQuote.trim();
    const text = textById.get(blockId);
    if (!text || !quote || quote.length > MAX_QUOTE_CHARS) return null;
    const index = text.indexOf(quote);
    if (index < 0) return null;
    const key = `${blockId}\u0000${quote}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      blockId,
      quote,
      prefix: text.slice(Math.max(0, index - ANCHOR_CONTEXT_CHARS), index),
      suffix: text.slice(index + quote.length, index + quote.length + ANCHOR_CONTEXT_CHARS),
    };
  };
}

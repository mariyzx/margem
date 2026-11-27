import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  SESSION_SIZE,
  type SessionActivityDto,
  sessionKindSchema,
  type StudioSessionDto,
  type StudioSessionRequest,
} from "@margem/shared";
import { PrismaService } from "../prisma/prisma.service";
import { lastRatings } from "./last-ratings";
import { planSession } from "./session-plan";

const SESSION_KINDS = sessionKindSchema.options;

@Injectable()
export class StudioSessionService {
  private readonly logger = new Logger(StudioSessionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async build(
    userId: string,
    notebookId: string,
    input: StudioSessionRequest,
  ): Promise<StudioSessionDto> {
    const notebook = await this.prisma.notebook.findFirst({
      where: { id: notebookId, ownerId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!notebook) throw new NotFoundException("Resource not found");

    const practices = await this.prisma.practiceItem.findMany({
      where: {
        notebookId,
        sourceId: { in: input.sourceIds },
        kind: { in: SESSION_KINDS },
        status: "approved",
        deletedAt: null,
        source: { notebookId, deletedAt: null, status: "ready" },
      },
      select: {
        id: true,
        kind: true,
        prompt: true,
        answer: true,
        sourceId: true,
        source: { select: { title: true } },
        sourceChunk: { select: { text: true, page: true } },
      },
    });
    if (practices.length === 0) return { activities: [] };

    const items = await this.prisma.reviewItem.findMany({
      where: {
        userId,
        kind: "practice",
        refId: { in: practices.map((practice) => practice.id) },
        deletedAt: null,
        archivedAt: null,
      },
      select: { id: true, refId: true, due: true },
    });
    const ratings = await lastRatings(
      this.prisma,
      items.map((item) => item.id),
    );
    const practiceById = new Map(practices.map((practice) => [practice.id, practice]));

    const candidates = items.flatMap((item) => {
      const practice = practiceById.get(item.refId);
      if (!practice) return [];
      return [
        {
          id: item.id,
          kind: practice.kind,
          sourceId: practice.sourceId,
          due: item.due,
          lastRating: ratings.get(item.id),
          practice,
        },
      ];
    });

    const plan = planSession(candidates, SESSION_SIZE[input.minutes], new Date());
    const activities: SessionActivityDto[] = plan.map(({ id, practice }) => ({
      reviewItemId: id,
      practiceId: practice.id,
      kind: sessionKindSchema.parse(practice.kind),
      prompt: practice.prompt,
      answer: practice.answer,
      sourceId: practice.sourceId,
      sourceTitle: practice.source.title,
      excerpt: practice.sourceChunk
        ? { text: practice.sourceChunk.text, page: practice.sourceChunk.page }
        : null,
    }));

    this.logger.log(
      {
        notebookId,
        minutes: input.minutes,
        sources: input.sourceIds.length,
        candidates: candidates.length,
        activities: activities.length,
      },
      "studio.session_built",
    );
    return { activities };
  }
}

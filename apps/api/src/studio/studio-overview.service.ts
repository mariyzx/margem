import { Injectable, NotFoundException } from "@nestjs/common";
import type { PracticeKind, StudioOverviewDto, StudioSourceDto } from "@margem/shared";
import { practiceKindSchema } from "@margem/shared";
import { Prisma, type ReviewKind, type ReviewRating } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { byWeakestFirst, masteryOf } from "./mastery";

const KIND_ORDER: PracticeKind[] = practiceKindSchema.options;

@Injectable()
export class StudioOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(userId: string, notebookId: string): Promise<StudioOverviewDto> {
    const notebook = await this.prisma.notebook.findFirst({
      where: { id: notebookId, ownerId: userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!notebook) throw new NotFoundException("Resource not found");

    const sources = await this.prisma.source.findMany({
      where: { notebookId, deletedAt: null },
      select: { id: true, title: true, type: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (sources.length === 0) return { notebook, sources: [] };
    const sourceIds = sources.map((source) => source.id);

    const [practices, notes] = await Promise.all([
      this.prisma.practiceItem.findMany({
        where: { notebookId, sourceId: { in: sourceIds }, status: "approved", deletedAt: null },
        select: { id: true, sourceId: true, kind: true },
      }),
      this.prisma.note.findMany({
        where: { notebookId, authorId: userId, deletedAt: null, sourceId: { in: sourceIds } },
        select: { id: true, sourceId: true },
      }),
    ]);
    const questions =
      notes.length === 0
        ? []
        : await this.prisma.question.findMany({
            where: {
              noteId: { in: notes.map((note) => note.id) },
              status: "approved",
              deletedAt: null,
            },
            select: { id: true, noteId: true },
          });

    const sourceByNote = new Map(notes.map((note) => [note.id, note.sourceId!]));
    const sourceByRef = new Map<string, string>();
    for (const practice of practices)
      sourceByRef.set(refKey("practice", practice.id), practice.sourceId);
    for (const question of questions) {
      const sourceId = sourceByNote.get(question.noteId);
      if (sourceId) sourceByRef.set(refKey("question", question.id), sourceId);
    }

    const lastRatingBySource = await this.lastRatingsBySource(
      userId,
      practices.map((practice) => practice.id),
      questions.map((question) => question.id),
      sourceByRef,
    );

    const result: StudioSourceDto[] = sources.map((source) => ({
      id: source.id,
      title: source.title,
      type: source.type,
      status: source.status,
      createdAt: source.createdAt.toISOString(),
      ...masteryOf(lastRatingBySource.get(source.id) ?? []),
      decks: decksOf(practices.filter((practice) => practice.sourceId === source.id)),
    }));
    return { notebook, sources: result.sort(byWeakestFirst) };
  }

  private async lastRatingsBySource(
    userId: string,
    practiceIds: string[],
    questionIds: string[],
    sourceByRef: Map<string, string>,
  ): Promise<Map<string, Array<ReviewRating | undefined>>> {
    const byKind: Array<{ kind: ReviewKind; refId: { in: string[] } }> = [];
    if (practiceIds.length > 0) byKind.push({ kind: "practice", refId: { in: practiceIds } });
    if (questionIds.length > 0) byKind.push({ kind: "question", refId: { in: questionIds } });
    if (byKind.length === 0) return new Map();

    const items = await this.prisma.reviewItem.findMany({
      where: { userId, deletedAt: null, archivedAt: null, OR: byKind },
      select: { id: true, kind: true, refId: true },
    });
    const lastLogs =
      items.length === 0
        ? []
        : await this.prisma.$queryRaw<Array<{ reviewItemId: string; rating: ReviewRating }>>`
            SELECT DISTINCT ON ("reviewItemId") "reviewItemId", "rating"
            FROM "ReviewLog"
            WHERE "reviewItemId" IN (${Prisma.join(items.map((item) => item.id))})
            ORDER BY "reviewItemId", "reviewedAt" DESC, "id" DESC
          `;
    const lastRatingByItem = new Map(lastLogs.map((log) => [log.reviewItemId, log.rating]));

    const bySource = new Map<string, Array<ReviewRating | undefined>>();
    for (const item of items) {
      const sourceId = sourceByRef.get(refKey(item.kind, item.refId));
      if (!sourceId) continue;
      const ratings = bySource.get(sourceId) ?? [];
      ratings.push(lastRatingByItem.get(item.id));
      bySource.set(sourceId, ratings);
    }
    return bySource;
  }
}

function refKey(kind: ReviewKind, refId: string): string {
  return `${kind}:${refId}`;
}

function decksOf(practices: Array<{ kind: PracticeKind }>): StudioSourceDto["decks"] {
  return KIND_ORDER.map((kind) => ({
    kind,
    count: practices.filter((practice) => practice.kind === kind).length,
  })).filter((deck) => deck.count > 0);
}

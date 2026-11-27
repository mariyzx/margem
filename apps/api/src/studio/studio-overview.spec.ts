import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { StudioOverviewService } from "./studio-overview.service";

const NOW = new Date("2026-11-27T12:00:00Z");

function setup() {
  const prisma = {
    notebook: {
      findFirst: vi.fn(async (args: { where: { ownerId: string } }) =>
        args.where.ownerId === "user-a" ? { id: "nb1", name: "Sistemas" } : null,
      ),
    },
    source: {
      findMany: vi.fn(async (_args: unknown) => [
        { id: "s1", title: "Aula 3: Filas", type: "file", status: "ready", createdAt: NOW },
        { id: "s2", title: "Aula 2: Cache", type: "text", status: "ready", createdAt: NOW },
        { id: "s3", title: "Livro", type: "link", status: "processing", createdAt: NOW },
      ]),
    },
    practiceItem: {
      findMany: vi.fn(async (_args: unknown) => [
        { id: "p1", sourceId: "s1", kind: "quiz" },
        { id: "p2", sourceId: "s1", kind: "quiz" },
        { id: "p3", sourceId: "s1", kind: "cloze" },
        { id: "p4", sourceId: "s2", kind: "why" },
      ]),
    },
    note: { findMany: vi.fn(async (_args: unknown) => [{ id: "n1", sourceId: "s2" }]) },
    question: { findMany: vi.fn(async (_args: unknown) => [{ id: "q1", noteId: "n1" }]) },
    reviewItem: {
      findMany: vi.fn(async (_args: unknown) => [
        { id: "r1", kind: "practice", refId: "p1" },
        { id: "r2", kind: "practice", refId: "p2" },
        { id: "r3", kind: "practice", refId: "p3" },
        { id: "r4", kind: "practice", refId: "p4" },
        { id: "r5", kind: "question", refId: "q1" },
      ]),
    },
    $queryRaw: vi.fn(async (..._args: unknown[]) => [
      { reviewItemId: "r1", rating: "again" },
      { reviewItemId: "r2", rating: "easy" },
      { reviewItemId: "r4", rating: "hard" },
      { reviewItemId: "r5", rating: "easy" },
    ]),
  };
  return { service: new StudioOverviewService(prisma as unknown as PrismaService), prisma };
}

describe("StudioOverviewService", () => {
  it("computes mastery per source from the last ratings, weakest first", async () => {
    const { service } = setup();
    const result = await service.overview("user-a", "nb1");

    expect(result.notebook).toEqual({ id: "nb1", name: "Sistemas" });
    expect(result.sources).toEqual([
      {
        id: "s1",
        title: "Aula 3: Filas",
        type: "file",
        status: "ready",
        createdAt: NOW.toISOString(),
        reviewItems: 3,
        mastered: 1,
        mastery: 33,
        decks: [
          { kind: "quiz", count: 2 },
          { kind: "cloze", count: 1 },
        ],
      },
      expect.objectContaining({ id: "s2", reviewItems: 2, mastered: 2, mastery: 100 }),
      expect.objectContaining({ id: "s3", reviewItems: 0, mastery: null, decks: [] }),
    ]);
  });

  it("only reads the person's approved items, active review items and own notes", async () => {
    const { service, prisma } = setup();
    await service.overview("user-a", "nb1");

    expect(prisma.practiceItem.findMany.mock.calls[0]![0]).toMatchObject({
      where: { notebookId: "nb1", status: "approved", deletedAt: null },
    });
    expect(prisma.note.findMany.mock.calls[0]![0]).toMatchObject({
      where: { notebookId: "nb1", authorId: "user-a", deletedAt: null },
    });
    expect(prisma.question.findMany.mock.calls[0]![0]).toMatchObject({
      where: { status: "approved", deletedAt: null },
    });
    expect(prisma.reviewItem.findMany.mock.calls[0]![0]).toMatchObject({
      where: { userId: "user-a", deletedAt: null, archivedAt: null },
    });
    const [sql, ...values] = prisma.$queryRaw.mock.calls[0]!;
    expect((sql as string[]).join("?")).toContain('DISTINCT ON ("reviewItemId")');
    expect((sql as string[]).join("?")).toContain('"reviewedAt" DESC');
    expect(JSON.stringify(values)).toContain("r5");
  });

  it("returns 404 for another person's notebook without reading sources", async () => {
    const { service, prisma } = setup();
    await expect(service.overview("user-b", "nb1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.source.findMany).not.toHaveBeenCalled();
  });
});

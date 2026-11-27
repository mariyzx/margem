import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { StudioSessionService } from "./studio-session.service";

const FUTURE = new Date("2030-01-01T00:00:00Z");

function practice(id: string, kind: string, sourceId: string) {
  return {
    id,
    kind,
    prompt: `${id}?`,
    answer: `${id}.`,
    sourceId,
    source: { title: sourceId === "s1" ? "Filas" : "Cache" },
    sourceChunk: { text: `Trecho de ${id}`, page: 2 },
  };
}

function setup() {
  const prisma = {
    notebook: {
      findFirst: vi.fn(async (args: { where: { ownerId: string } }) =>
        args.where.ownerId === "user-a" ? { id: "nb1" } : null,
      ),
    },
    practiceItem: {
      findMany: vi.fn(async (_args: unknown) => [
        practice("p1", "quiz", "s1"),
        practice("p2", "cloze", "s2"),
        practice("p3", "why", "s1"),
      ]),
    },
    reviewItem: {
      findMany: vi.fn(async (_args: unknown) => [
        { id: "r1", refId: "p1", due: FUTURE },
        { id: "r2", refId: "p2", due: FUTURE },
      ]),
    },
    $queryRaw: vi.fn(async (..._args: unknown[]) => [{ reviewItemId: "r1", rating: "easy" }]),
  };
  return { service: new StudioSessionService(prisma as unknown as PrismaService), prisma };
}

describe("StudioSessionService", () => {
  it("builds the session from approved practice with a review item, weakest first", async () => {
    const { service } = setup();
    const { activities } = await service.build("user-a", "nb1", {
      sourceIds: ["s1", "s2"],
      minutes: 10,
    });

    expect(activities).toEqual([
      {
        reviewItemId: "r2",
        practiceId: "p2",
        kind: "cloze",
        prompt: "p2?",
        answer: "p2.",
        sourceId: "s2",
        sourceTitle: "Cache",
        excerpt: { text: "Trecho de p2", page: 2 },
      },
      expect.objectContaining({ reviewItemId: "r1", practiceId: "p1", kind: "quiz" }),
    ]);
  });

  it("only reads approved session kinds from ready sources of this notebook", async () => {
    const { service, prisma } = setup();
    await service.build("user-a", "nb1", { sourceIds: ["s1"], minutes: 20 });

    expect(prisma.practiceItem.findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        notebookId: "nb1",
        sourceId: { in: ["s1"] },
        kind: { in: ["quiz", "cloze", "why"] },
        status: "approved",
        deletedAt: null,
        source: { notebookId: "nb1", deletedAt: null, status: "ready" },
      },
    });
    expect(prisma.reviewItem.findMany.mock.calls[0]![0]).toMatchObject({
      where: { userId: "user-a", kind: "practice", deletedAt: null, archivedAt: null },
    });
  });

  it("returns 404 for another person's notebook without reading practice", async () => {
    const { service, prisma } = setup();
    await expect(
      service.build("user-b", "nb1", { sourceIds: ["s1"], minutes: 10 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.practiceItem.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty session when the sources have no practice", async () => {
    const { service, prisma } = setup();
    prisma.practiceItem.findMany.mockResolvedValueOnce([]);
    expect(await service.build("user-a", "nb1", { sourceIds: ["s1"], minutes: 10 })).toEqual({
      activities: [],
    });
    expect(prisma.reviewItem.findMany).not.toHaveBeenCalled();
  });
});

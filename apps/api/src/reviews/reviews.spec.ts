import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { ReviewsService } from "./reviews.service";

describe("ReviewsService", () => {
  it("returns 404 when another user tries to submit a review or enqueue errors on another user's note", async () => {
    const prisma = {
      reviewItem: {
        findUnique: vi.fn(async () => ({
          id: "rev-1",
          userId: "user-1",
          archivedAt: null,
          deletedAt: null,
        })),
      },
      note: {
        findUnique: vi.fn(async () => ({
          id: "note-1",
          authorId: "user-1",
          deletedAt: null,
        })),
      },
    } as unknown as PrismaService;

    const service = new ReviewsService(prisma, new PolicyService());

    await expect(service.submitReview("user-2", "rev-1", "easy")).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.enqueueStudyErrors("user-2", { noteId: "note-1", questionIds: ["q-1"] }),
    ).rejects.toThrow(NotFoundException);
  });

  it("only sends approved questions to the review, never pending AI suggestions", async () => {
    const findMany = vi.fn(async (_args: unknown) => []);
    const prisma = {
      note: {
        findUnique: vi.fn(async () => ({ id: "note-1", authorId: "user-1", deletedAt: null })),
      },
      question: { findMany },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ auditLog: { create: vi.fn(async () => ({})) } }),
      ),
    } as unknown as PrismaService;

    await new ReviewsService(prisma, new PolicyService()).enqueueStudyErrors("user-1", {
      noteId: "note-1",
      questionIds: ["q-ai-pending"],
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "approved" }) }),
    );
  });

  it("shows approved practice cards without the source excerpt, which would give the answer away", async () => {
    const due = new Date("2026-11-27T10:00:00Z");
    const reviewItem = {
      id: "rev-p",
      userId: "user-1",
      kind: "practice",
      refId: "p1",
      due,
      stability: 1,
      difficulty: 5,
      scheduledDays: 1,
      learningSteps: 0,
      reps: 1,
      lapses: 0,
      state: 2,
      lastReview: due,
      archivedAt: null,
      deletedAt: null,
    };
    const practiceFindMany = vi.fn(async (_args: unknown) => [
      {
        id: "p1",
        notebookId: "nb1",
        prompt: "O UDP não garante ____ nem ordem.",
        answer: "entrega",
        notebook: { name: "Redes" },
      },
    ]);
    const prisma = {
      reviewItem: { findMany: vi.fn(async () => [reviewItem]) },
      question: { findMany: vi.fn(async () => []) },
      practiceItem: { findMany: practiceFindMany },
    } as unknown as PrismaService;

    const cards = await new ReviewsService(prisma, new PolicyService()).listDue("user-1");

    expect(cards).toEqual([
      expect.objectContaining({
        kind: "practice",
        prompt: "O UDP não garante ____ nem ordem.",
        answer: "entrega",
        notebookName: "Redes",
        quote: null,
        noteId: null,
      }),
    ]);
    expect(practiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "approved",
          notebook: { ownerId: "user-1", deletedAt: null },
        }),
      }),
    );
  });
});

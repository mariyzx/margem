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
});

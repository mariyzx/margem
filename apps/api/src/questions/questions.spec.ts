import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { QuestionsService } from "./questions.service";

describe("QuestionsService", () => {
  it("returns 404 when another user accesses or mutates a note question", async () => {
    const prisma = {
      note: {
        findUnique: vi.fn(async () => ({ id: "note-1", authorId: "user-1", deletedAt: null })),
      },
      question: {
        findUnique: vi.fn(async () => ({
          id: "q-1",
          noteId: "note-1",
          anchorId: "a-1",
          deletedAt: null,
          note: { authorId: "user-1", deletedAt: null },
        })),
      },
    } as unknown as PrismaService;

    const service = new QuestionsService(prisma, new PolicyService());

    await expect(service.listForNote("user-2", "note-1")).rejects.toThrow(NotFoundException);
    await expect(service.create("user-2", "note-1", { text: "P?", answer: "R." })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.update("user-2", "q-1", { text: "Edit" })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove("user-2", "q-1")).rejects.toThrow(NotFoundException);
  });
});

import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SourcesService } from "./sources.service";

describe("SourcesService", () => {
  it("returns 404 when another user accesses or creates a source in someone else's notebook", async () => {
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      source: {
        findUnique: vi.fn(async () => ({
          id: "src-1",
          notebookId: "nb-1",
          deletedAt: null,
          notebook: { ownerId: "user-1", deletedAt: null },
        })),
      },
    } as unknown as PrismaService;

    const service = new SourcesService(prisma, new PolicyService());

    await expect(
      service.createText("user-2", { notebookId: "nb-1", title: "Aula", content: "Texto" }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.getById("user-2", "src-1")).rejects.toThrow(NotFoundException);
  });
});

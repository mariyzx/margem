import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/session.middleware";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { NotebooksController } from "./notebooks.controller";
import { NotebooksService } from "./notebooks.service";

function makeReq(userId: string): AuthenticatedRequest {
  return { user: { id: userId, email: `${userId}@margem.local` } } as AuthenticatedRequest;
}

describe("NotebooksService & NotebooksController", () => {
  it("lists notebooks scoped to the authenticated user", async () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const prisma = {
      notebook: {
        findMany: vi.fn(async () => [
          {
            id: "nb-1",
            ownerId: "user-1",
            name: "Redes",
            color: "bic",
            createdAt: now,
            updatedAt: now,
            notes: [
              {
                id: "note-1",
                notebookId: "nb-1",
                title: "TCP vs UDP",
                createdAt: now,
                updatedAt: now,
              },
            ],
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new NotebooksService(prisma, new PolicyService());
    const result = await service.listForUser("user-1");

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Redes");
    expect(result[0]?.notes?.[0]?.title).toBe("TCP vs UDP");
  });

  it("rejects empty notebook name on create", async () => {
    const service = new NotebooksService({} as PrismaService, new PolicyService());
    const controller = new NotebooksController(service);

    await expect(
      controller.create(makeReq("user-1"), { name: "   ", color: "bic" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns 404 when another user tries to update or delete a notebook", async () => {
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1" })),
      },
    } as unknown as PrismaService;

    const service = new NotebooksService(prisma, new PolicyService());

    await expect(service.update("user-2", "nb-1", { name: "Hack" })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove("user-2", "nb-1")).rejects.toThrow(NotFoundException);
  });
});

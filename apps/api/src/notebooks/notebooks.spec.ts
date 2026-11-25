import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/session";
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
            deletedAt: null,
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
    const { notebooks: result, nextCursor } = await service.listForUser("user-1", { limit: 50 });

    expect(result).toHaveLength(1);
    expect(nextCursor).toBeNull();
    expect(result[0]?.name).toBe("Redes");
    expect(result[0]?.notes?.[0]?.title).toBe("TCP vs UDP");
    expect(result[0]?.hasMoreNotes).toBe(false);
  });

  it("soft-deletes notebook + notes and writes audit log", async () => {
    const auditLogs: Array<{ userId?: string; action: string }> = [];
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          notebook: { update: vi.fn(async () => ({ id: "nb-1" })) },
          note: { updateMany: vi.fn(async () => ({ count: 2 })) },
          auditLog: {
            create: vi.fn(async ({ data }: { data: { userId?: string; action: string } }) => {
              auditLogs.push(data);
              return data;
            }),
          },
        }),
      ),
    } as unknown as PrismaService;

    const service = new NotebooksService(prisma, new PolicyService());
    const res = await service.remove("user-1", "nb-1");

    expect(res).toEqual({ ok: true });
    expect(auditLogs).toEqual([
      { userId: "user-1", action: "notebook.deleted", metadata: { notebookId: "nb-1" } },
    ]);
  });

  it("rejects empty notebook name on create", async () => {
    const service = new NotebooksService({} as PrismaService, new PolicyService());
    const controller = new NotebooksController(service);

    await expect(
      controller.create(makeReq("user-1"), { name: "   ", color: "bic" }),
    ).rejects.toThrow(BadRequestException);
  });

  it("returns 404 when another user or soft-deleted notebook is updated or deleted", async () => {
    const prisma = {
      notebook: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "nb-1", ownerId: "user-1", deletedAt: null })
          .mockResolvedValueOnce({ id: "nb-1", ownerId: "user-1", deletedAt: null })
          .mockResolvedValueOnce({ id: "nb-2", ownerId: "user-1", deletedAt: new Date() }),
      },
    } as unknown as PrismaService;

    const service = new NotebooksService(prisma, new PolicyService());

    await expect(service.update("user-2", "nb-1", { name: "Hack" })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove("user-2", "nb-1")).rejects.toThrow(NotFoundException);
    await expect(service.update("user-1", "nb-2", { name: "Deleted" })).rejects.toThrow(
      NotFoundException,
    );
  });
});

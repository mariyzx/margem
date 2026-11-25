import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { NotesService } from "./notes.service";

describe("NotesService", () => {
  it("creates a note in a notebook owned by the user and writes audit log", async () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const auditLogs: Array<{ userId?: string; action: string }> = [];
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      note: { count: vi.fn(async () => 0) },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          note: {
            create: vi.fn(async () => ({
              id: "note-1",
              notebookId: "nb-1",
              authorId: "user-1",
              title: "Primeira nota",
              doc: { type: "doc", content: [{ type: "paragraph" }] },
              materialOpenedAt: null,
              sourceId: null,
              deletedAt: null,
              createdAt: now,
              updatedAt: now,
            })),
          },
          auditLog: {
            create: vi.fn(async ({ data }: { data: { userId?: string; action: string } }) => {
              auditLogs.push(data);
              return data;
            }),
          },
        }),
      ),
    } as unknown as PrismaService;

    const service = new NotesService(prisma, new PolicyService());
    const note = await service.create("user-1", {
      notebookId: "nb-1",
      title: "Primeira nota",
    });

    expect(note.id).toBe("note-1");
    expect(note.title).toBe("Primeira nota");
    expect(note.materialOpenedAt).toBeNull();
    expect(auditLogs[0]?.action).toBe("note.created");
  });

  it("soft-deletes note and writes audit log", async () => {
    const auditLogs: Array<{ userId?: string; action: string }> = [];
    const prisma = {
      note: {
        findUnique: vi.fn(async () => ({ id: "note-1", authorId: "user-1", deletedAt: null })),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          note: { update: vi.fn(async () => ({ id: "note-1" })) },
          auditLog: {
            create: vi.fn(async ({ data }: { data: { userId?: string; action: string } }) => {
              auditLogs.push(data);
              return data;
            }),
          },
        }),
      ),
    } as unknown as PrismaService;

    const service = new NotesService(prisma, new PolicyService());
    const res = await service.remove("user-1", "note-1");

    expect(res).toEqual({ ok: true });
    expect(auditLogs).toEqual([
      { userId: "user-1", action: "note.deleted", metadata: { noteId: "note-1" } },
    ]);
  });

  it("returns 404 when another user tries to read, create in, update, or delete a note, or when soft-deleted", async () => {
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      note: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "note-1", authorId: "user-1", deletedAt: null })
          .mockResolvedValueOnce({ id: "note-1", authorId: "user-1", deletedAt: null })
          .mockResolvedValueOnce({ id: "note-1", authorId: "user-1", deletedAt: null })
          .mockResolvedValueOnce({ id: "note-2", authorId: "user-1", deletedAt: new Date() }),
      },
    } as unknown as PrismaService;

    const service = new NotesService(prisma, new PolicyService());

    await expect(service.getById("user-2", "note-1")).rejects.toThrow(NotFoundException);
    await expect(service.create("user-2", { notebookId: "nb-1", title: "Hack" })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.update("user-2", "note-1", { title: "Hack" })).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove("user-2", "note-1")).rejects.toThrow(NotFoundException);
    await expect(service.getById("user-1", "note-2")).rejects.toThrow(NotFoundException);
  });
});

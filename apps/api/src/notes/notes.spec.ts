import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { NotesService } from "./notes.service";

describe("NotesService", () => {
  it("creates a note in a notebook owned by the user", async () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1" })),
      },
      note: {
        create: vi.fn(async () => ({
          id: "note-1",
          notebookId: "nb-1",
          authorId: "user-1",
          title: "Primeira nota",
          doc: { type: "doc", content: [{ type: "paragraph" }] },
          materialOpenedAt: null,
          sourceId: null,
          createdAt: now,
          updatedAt: now,
        })),
      },
    } as unknown as PrismaService;

    const service = new NotesService(prisma, new PolicyService());
    const note = await service.create("user-1", {
      notebookId: "nb-1",
      title: "Primeira nota",
    });

    expect(note.id).toBe("note-1");
    expect(note.title).toBe("Primeira nota");
    expect(note.materialOpenedAt).toBeNull();
  });

  it("returns 404 when another user tries to read, create in, update, or delete a note", async () => {
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1" })),
      },
      note: {
        findUnique: vi.fn(async () => ({ id: "note-1", authorId: "user-1" })),
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
  });
});

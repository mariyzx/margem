import { BadRequestException } from "@nestjs/common";
import { NOTEBOOK_NOTES_PREVIEW_LIMIT } from "@margem/shared";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/session";
import { NotebooksController } from "../notebooks/notebooks.controller";
import { NotebooksService } from "../notebooks/notebooks.service";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { QuestionsService } from "../questions/questions.service";
import { cursorArgs, parsePagination, toPage } from "./pagination";

const now = new Date("2026-11-26T12:00:00Z");
const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}`);

function noteRow(id: string) {
  return { id, notebookId: "nb-1", title: id, createdAt: now, updatedAt: now };
}

function notebookRow(id: string, noteCount = 0) {
  return {
    id,
    ownerId: "user-1",
    name: id,
    color: "bic" as const,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    notes: ids(`${id}-note`, noteCount).map(noteRow),
  };
}

describe("pagination helpers", () => {
  it("parses limit with default 50 and max 100", () => {
    expect(parsePagination({})).toEqual({ limit: 50 });
    expect(parsePagination({ limit: "100", cursor: "abc" })).toEqual({ limit: 100, cursor: "abc" });
    expect(() => parsePagination({ limit: "101" })).toThrow(BadRequestException);
    expect(() => parsePagination({ limit: "0" })).toThrow(BadRequestException);
    expect(() => parsePagination({ cursor: "x".repeat(65) })).toThrow(BadRequestException);
  });

  it("asks Prisma for one extra row and skips the cursor row itself", () => {
    expect(cursorArgs({ limit: 50 })).toEqual({ take: 51 });
    expect(cursorArgs({ limit: 10, cursor: "nb-9" })).toEqual({
      take: 11,
      cursor: { id: "nb-9" },
      skip: 1,
    });
  });

  it("returns nextCursor only when there is another page", () => {
    const rows = ids("r", 4).map((id) => ({ id }));
    expect(toPage(rows, 3)).toEqual({ items: rows.slice(0, 3), nextCursor: "r-3" });
    expect(toPage(rows, 4)).toEqual({ items: rows, nextCursor: null });
  });
});

describe("GET /notebooks", () => {
  it("returns at most `limit` notebooks and a cursor for the next page", async () => {
    const findMany = vi.fn(async () => ids("nb", 51).map((id) => notebookRow(id)));
    const service = new NotebooksService(
      { notebook: { findMany } } as unknown as PrismaService,
      new PolicyService(),
    );

    const page = await service.listForUser("user-1", { limit: 50 });

    expect(page.notebooks).toHaveLength(50);
    expect(page.nextCursor).toBe("nb-50");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "user-1", deletedAt: null },
        take: 51,
        include: expect.objectContaining({
          notes: expect.objectContaining({ take: NOTEBOOK_NOTES_PREVIEW_LIMIT + 1 }),
        }),
      }),
    );
  });

  it("embeds at most 100 notes per notebook and flags the rest", async () => {
    const service = new NotebooksService(
      {
        notebook: {
          findMany: vi.fn(async () => [notebookRow("big", 101), notebookRow("small", 3)]),
        },
      } as unknown as PrismaService,
      new PolicyService(),
    );

    const { notebooks } = await service.listForUser("user-1", { limit: 50 });

    expect(notebooks[0]?.notes).toHaveLength(100);
    expect(notebooks[0]?.hasMoreNotes).toBe(true);
    expect(notebooks[1]?.notes).toHaveLength(3);
    expect(notebooks[1]?.hasMoreNotes).toBe(false);
  });

  it("rejects limit above 100 with 400 at the controller", () => {
    const controller = new NotebooksController(
      new NotebooksService({} as PrismaService, new PolicyService()),
    );
    const req = { user: { id: "user-1" } } as AuthenticatedRequest;
    expect(() => controller.list(req, { limit: "500" })).toThrow(BadRequestException);
  });
});

describe("GET /notebooks/:id/notes", () => {
  it("pages the notes of an owned notebook", async () => {
    const findMany = vi.fn(async () => ids("n", 3).map(noteRow));
    const service = new NotebooksService(
      {
        notebook: { findUnique: vi.fn(async () => ({ ownerId: "user-1", deletedAt: null })) },
        note: { findMany },
      } as unknown as PrismaService,
      new PolicyService(),
    );

    const page = await service.listNotes("user-1", "nb-1", { limit: 2, cursor: "n-0" });

    expect(page.notes.map((n) => n.id)).toEqual(["n-1", "n-2"]);
    expect(page.nextCursor).toBe("n-2");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { notebookId: "nb-1", deletedAt: null },
        take: 3,
        cursor: { id: "n-0" },
        skip: 1,
      }),
    );
  });

  it("returns 404 for another user's notebook before listing anything", async () => {
    const findMany = vi.fn();
    const service = new NotebooksService(
      {
        notebook: { findUnique: vi.fn(async () => ({ ownerId: "user-1", deletedAt: null })) },
        note: { findMany },
      } as unknown as PrismaService,
      new PolicyService(),
    );

    await expect(service.listNotes("user-2", "nb-1", { limit: 50 })).rejects.toThrow();
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("GET /notes/:noteId/questions", () => {
  it("pages questions in creation order", async () => {
    const rows = ids("q", 3).map((id) => ({
      id,
      noteId: "note-1",
      anchorId: null,
      anchor: null,
      authorType: "self",
      authorId: "user-1",
      text: id,
      answer: "r",
      status: "approved",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }));
    const findMany = vi.fn(async () => rows);
    const service = new QuestionsService(
      {
        note: {
          findUnique: vi.fn(async () => ({
            id: "note-1",
            authorId: "user-1",
            deletedAt: null,
            doc: { type: "doc", content: [] },
          })),
        },
        question: { findMany },
      } as unknown as PrismaService,
      new PolicyService(),
    );

    const page = await service.listForNote("user-1", "note-1", { limit: 2 });

    expect(page.questions.map((q) => q.id)).toEqual(["q-1", "q-2"]);
    expect(page.nextCursor).toBe("q-2");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 3,
      }),
    );
  });
});

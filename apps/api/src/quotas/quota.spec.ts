import { UnprocessableEntityException } from "@nestjs/common";
import { QUOTA_EXCEEDED_CODE, quotaExceededErrorSchema } from "@margem/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotebooksService } from "../notebooks/notebooks.service";
import { NotesService } from "../notes/notes.service";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { QuestionsService } from "../questions/questions.service";
import { SourcesService } from "../sources/sources.service";
import { assertWithinQuota, quotaLimit } from "./quota";

const STOP = new Error("reached the write");

async function quotaError(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("per-user quotas", () => {
  afterEach(() => {
    delete process.env.MAX_NOTEBOOKS_PER_USER;
    delete process.env.MAX_NOTES_PER_USER;
    delete process.env.MAX_SOURCES_PER_USER;
    delete process.env.MAX_QUESTIONS_PER_USER;
  });

  it("uses the proposed defaults", () => {
    expect(quotaLimit("notebooks")).toBe(100);
    expect(quotaLimit("notes")).toBe(5000);
    expect(quotaLimit("sources")).toBe(500);
    expect(quotaLimit("questions")).toBe(10000);
  });

  it("throws 422 with a typed body and a clear pt-BR message", () => {
    process.env.MAX_NOTES_PER_USER = "3";

    expect(() => assertWithinQuota("notes", 2)).not.toThrow();
    const error = (() => {
      try {
        assertWithinQuota("notes", 3);
      } catch (e) {
        return e as UnprocessableEntityException;
      }
    })();

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error!.getStatus()).toBe(422);
    const body = quotaExceededErrorSchema.parse(error!.getResponse());
    expect(body).toEqual({
      code: QUOTA_EXCEEDED_CODE,
      resource: "notes",
      limit: 3,
      message: "Você chegou ao limite de 3 notas. Apague alguma para criar outra.",
    });
  });

  it("notebooks: counts active notebooks of the owner and blocks at the cap", async () => {
    process.env.MAX_NOTEBOOKS_PER_USER = "2";
    const count = vi.fn(async () => 2);
    const $transaction = vi.fn(async () => {
      throw STOP;
    });
    const service = new NotebooksService(
      { notebook: { count }, $transaction } as unknown as PrismaService,
      new PolicyService(),
    );

    const error = await quotaError(service.create("user-1", { name: "Redes", color: "bic" }));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(count).toHaveBeenCalledWith({ where: { ownerId: "user-1", deletedAt: null } });
    expect($transaction).not.toHaveBeenCalled();

    count.mockResolvedValueOnce(1);
    await expect(service.create("user-1", { name: "Redes", color: "bic" })).rejects.toBe(STOP);
  });

  it("notes: counts active notes by author and blocks at the cap", async () => {
    process.env.MAX_NOTES_PER_USER = "5";
    const count = vi.fn(async () => 5);
    const $transaction = vi.fn();
    const service = new NotesService(
      {
        notebook: {
          findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
        },
        note: { count },
        $transaction,
      } as unknown as PrismaService,
      new PolicyService(),
    );

    const error = await quotaError(service.create("user-1", { notebookId: "nb-1" }));

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(count).toHaveBeenCalledWith({ where: { authorId: "user-1", deletedAt: null } });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("sources: counts active sources in the user's active notebooks and blocks at the cap", async () => {
    process.env.MAX_SOURCES_PER_USER = "1";
    const count = vi.fn(async () => 1);
    const $transaction = vi.fn();
    const service = new SourcesService(
      {
        notebook: {
          findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
        },
        source: { count },
        $transaction,
      } as unknown as PrismaService,
      new PolicyService(),
    );

    const error = await quotaError(
      service.createText("user-1", { notebookId: "nb-1", title: "Texto", content: "Conteúdo" }),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(count).toHaveBeenCalledWith({
      where: { deletedAt: null, notebook: { ownerId: "user-1", deletedAt: null } },
    });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("questions: counts active questions by author and blocks at the cap", async () => {
    process.env.MAX_QUESTIONS_PER_USER = "4";
    const count = vi.fn(async () => 4);
    const $transaction = vi.fn();
    const service = new QuestionsService(
      {
        note: {
          findUnique: vi.fn(async () => ({ id: "note-1", authorId: "user-1", deletedAt: null })),
        },
        question: { count },
        $transaction,
      } as unknown as PrismaService,
      new PolicyService(),
    );

    const error = await quotaError(
      service.create("user-1", "note-1", { text: "Por quê?", answer: "Porque sim." }),
    );

    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(count).toHaveBeenCalledWith({
      where: { authorId: "user-1", deletedAt: null, note: { deletedAt: null } },
    });
    expect($transaction).not.toHaveBeenCalled();
  });

  it("checks ownership before revealing anything about another user's quota", async () => {
    const count = vi.fn(async () => 999_999);
    const service = new NotesService(
      {
        notebook: {
          findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
        },
        note: { count },
      } as unknown as PrismaService,
      new PolicyService(),
    );

    const error = await quotaError(service.create("user-2", { notebookId: "nb-1" }));

    expect(error).not.toBeInstanceOf(UnprocessableEntityException);
    expect(count).not.toHaveBeenCalled();
  });
});

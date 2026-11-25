import { describe, expect, it } from "vitest";
import {
  notebookSchema,
  paginationQuerySchema,
  PAGE_DEFAULT_LIMIT,
  PAGE_MAX_LIMIT,
  quotaExceededErrorSchema,
} from "./index";

describe("paginationQuerySchema", () => {
  it("defaults to 50 and coerces query strings", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: PAGE_DEFAULT_LIMIT });
    expect(paginationQuerySchema.parse({ limit: "20", cursor: "abc" })).toEqual({
      limit: 20,
      cursor: "abc",
    });
  });

  it("rejects limits outside 1..100 and oversized cursors", () => {
    expect(paginationQuerySchema.safeParse({ limit: String(PAGE_MAX_LIMIT + 1) }).success).toBe(
      false,
    );
    expect(paginationQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ cursor: "x".repeat(65) }).success).toBe(false);
  });
});

describe("quotaExceededErrorSchema", () => {
  it("accepts the 422 body the API sends", () => {
    expect(
      quotaExceededErrorSchema.safeParse({
        code: "quota_exceeded",
        resource: "sources",
        limit: 500,
        message: "Você chegou ao limite de 500 materiais.",
      }).success,
    ).toBe(true);
    expect(quotaExceededErrorSchema.safeParse({ statusCode: 422 }).success).toBe(false);
  });
});

describe("notebookSchema", () => {
  it("keeps hasMoreNotes optional for older payloads", () => {
    const base = {
      id: "nb",
      name: "Redes",
      color: "bic",
      createdAt: "2026-11-26T00:00:00.000Z",
      updatedAt: "2026-11-26T00:00:00.000Z",
    };
    expect(notebookSchema.parse(base).hasMoreNotes).toBeUndefined();
    expect(notebookSchema.parse({ ...base, hasMoreNotes: true }).hasMoreNotes).toBe(true);
  });
});

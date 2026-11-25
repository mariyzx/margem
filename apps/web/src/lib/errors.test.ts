import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { createErrorMessage } from "./errors";

describe("createErrorMessage", () => {
  it("explains the per-user cap when the API answered quota_exceeded", () => {
    const error = new ApiError("Create notebook failed with status 422", 422, {
      code: "quota_exceeded",
      resource: "notebooks",
      limit: 1000,
      message: "ignored: the web uses its own copy",
    });

    expect(createErrorMessage(error, "genérico")).toBe(
      "Você chegou ao limite de 1.000 cadernos. Apague algum para criar outro.",
    );
  });

  it("falls back to the generic message for any other failure", () => {
    expect(createErrorMessage(new ApiError("x", 500), "genérico")).toBe("genérico");
    expect(createErrorMessage(new Error("network"), "genérico")).toBe("genérico");
  });
});

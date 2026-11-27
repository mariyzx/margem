import { describe, expect, it } from "vitest";
import { windowTitle } from "./window-title";

describe("windowTitle", () => {
  it("shows only the app name when no note is open", () => {
    expect(windowTitle(null)).toBe("Margem");
  });

  it("puts the open note's title before the app name", () => {
    expect(windowTitle("  Banco de dados ")).toBe("Banco de dados — Margem");
  });

  it("names a note without a title", () => {
    expect(windowTitle("   ")).toBe("Nota sem título — Margem");
  });
});

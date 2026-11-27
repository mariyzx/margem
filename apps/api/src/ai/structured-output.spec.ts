import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseStructured } from "./structured-output";

const schema = z.object({
  verdict: z.enum(["right", "partial", "wrong"]),
  missing: z.array(z.string()),
});

describe("parseStructured", () => {
  it("accepts valid JSON", () => {
    expect(parseStructured('{"verdict":"right","missing":[]}', schema)).toEqual({
      verdict: "right",
      missing: [],
    });
  });

  it("tolerates one Markdown fence, common in small local models", () => {
    expect(parseStructured('```json\n{"verdict":"partial","missing":["x"]}\n```', schema)).toEqual({
      verdict: "partial",
      missing: ["x"],
    });
  });

  it.each([
    ["not JSON", "Claro! Aqui está a correção."],
    ["wrong shape", '{"verdict":"maybe","missing":[]}'],
    ["extra text around JSON", 'Resposta: {"verdict":"right","missing":[]}'],
    ["truncated", '{"verdict":"right","missing":['],
  ])("discards %s", (_label, text) => {
    expect(parseStructured(text, schema)).toBeNull();
  });

  it("strips fields the schema does not know (e.g. injected instructions)", () => {
    const parsed = parseStructured(
      '{"verdict":"right","missing":[],"__proto__":{"admin":true},"html":"<script>"}',
      schema,
    );
    expect(parsed).toEqual({ verdict: "right", missing: [] });
  });
});

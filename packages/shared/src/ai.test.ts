import { aiFeaturesSchema, createAiCredentialSchema, updateAiSettingsSchema } from "./ai";
import { describe, expect, it } from "vitest";

const FAKE_KEY = "x".repeat(12);

describe("aiFeaturesSchema", () => {
  it("reads an empty JSON as every feature enabled", () => {
    expect(aiFeaturesSchema.parse({})).toEqual({
      suggestClozesQuestions: true,
      gradeAnswers: true,
      explainAfterError: true,
      askNotebook: true,
    });
  });

  it("keeps what the person turned off", () => {
    expect(aiFeaturesSchema.parse({ askNotebook: false }).askNotebook).toBe(false);
  });
});

describe("updateAiSettingsSchema", () => {
  it("does not fill features the person did not send", () => {
    expect(updateAiSettingsSchema.parse({ features: { askNotebook: false } })).toEqual({
      features: { askNotebook: false },
    });
  });

  it.each([{ enable: false }, { features: { unknownFeature: true } }])(
    "rejects unknown keys: %j",
    (body) => {
      expect(updateAiSettingsSchema.safeParse(body).success).toBe(false);
    },
  );
});

describe("createAiCredentialSchema", () => {
  it("accepts a pasted Groq key and trims it", () => {
    expect(createAiCredentialSchema.parse({ provider: "groq", apiKey: `  ${FAKE_KEY}  ` })).toEqual(
      { provider: "groq", apiKey: FAKE_KEY },
    );
  });

  it.each([
    { provider: "openrouter", apiKey: FAKE_KEY },
    { provider: "groq", apiKey: "short" },
    { provider: "groq", apiKey: "x".repeat(257) },
  ])("rejects %j", (body) => {
    expect(createAiCredentialSchema.safeParse(body).success).toBe(false);
  });
});

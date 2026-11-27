import { z } from "zod";

export const aiPromptTargetSchema = z.enum(["claude", "chatgpt", "gemini"]);
export type AiPromptTarget = z.infer<typeof aiPromptTargetSchema>;

export const aiCredentialProviderSchema = z.enum(["openrouter", "groq"]);
export type AiCredentialProvider = z.infer<typeof aiCredentialProviderSchema>;

export const aiFeaturesSchema = z.object({
  suggestClozesQuestions: z.boolean().default(true),
  gradeAnswers: z.boolean().default(true),
  explainAfterError: z.boolean().default(true),
  askNotebook: z.boolean().default(true),
});
export type AiFeatures = z.infer<typeof aiFeaturesSchema>;

export const updateAiSettingsSchema = z.strictObject({
  enabled: z.boolean().optional(),
  promptTarget: aiPromptTargetSchema.optional(),
  features: z
    .strictObject({
      suggestClozesQuestions: z.boolean().optional(),
      gradeAnswers: z.boolean().optional(),
      explainAfterError: z.boolean().optional(),
      askNotebook: z.boolean().optional(),
    })
    .optional(),
});
export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

export const createAiCredentialSchema = z.strictObject({
  provider: z.literal("groq"),
  apiKey: z.string().trim().min(8, "Chave muito curta").max(256, "Chave muito longa"),
});
export type CreateAiCredentialInput = z.infer<typeof createAiCredentialSchema>;

export const aiCredentialSummarySchema = z.object({
  provider: aiCredentialProviderSchema,
  keyLast4: z.string(),
  createdAt: z.string(),
});
export type AiCredentialSummary = z.infer<typeof aiCredentialSummarySchema>;

export const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  promptTarget: aiPromptTargetSchema,
  features: aiFeaturesSchema,
  credentials: z.array(aiCredentialSummarySchema),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const aiUsageFeatureSchema = z.enum([
  "suggest-clozes-questions",
  "memory-gaps",
  "grade-answer",
  "explain-after-error",
  "generate-practice",
  "ask-notebook",
]);
export type AiUsageFeature = z.infer<typeof aiUsageFeatureSchema>;

export const AI_UNAVAILABLE_CODE = "ai_unavailable";

export const aiUnavailableReasonSchema = z.enum([
  "disabled",
  "feature_disabled",
  "no_provider",
  "invalid_key",
  "quota",
  "timeout",
  "provider_error",
  "invalid_output",
  "rate_limited",
]);
export type AiUnavailableReason = z.infer<typeof aiUnavailableReasonSchema>;

export const aiUnavailableErrorSchema = z.object({
  code: z.literal(AI_UNAVAILABLE_CODE),
  reason: aiUnavailableReasonSchema,
});
export type AiUnavailableError = z.infer<typeof aiUnavailableErrorSchema>;

export const aiCredentialTestFailureSchema = z.object({
  code: z.enum(["invalid_key", "provider_unreachable"]),
});
export type AiCredentialTestFailure = z.infer<typeof aiCredentialTestFailureSchema>;

export const finishOpenRouterSchema = z.strictObject({
  state: z.string().trim().min(16).max(200),
  code: z.string().trim().min(1).max(1000),
});
export type FinishOpenRouterInput = z.infer<typeof finishOpenRouterSchema>;

export const openRouterConnectFailureSchema = z.object({
  code: z.enum(["oauth_state_invalid", "oauth_code_invalid", "provider_unreachable"]),
});
export type OpenRouterConnectFailure = z.infer<typeof openRouterConnectFailureSchema>;

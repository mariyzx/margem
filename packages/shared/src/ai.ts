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

import { z } from "zod";

export const magicLinkRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido"),
});

export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestSchema>;

export const magicLinkVerifySchema = z.object({
  token: z.string().trim().min(1, "Token obrigatório"),
});

export type MagicLinkVerifyInput = z.infer<typeof magicLinkVerifySchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

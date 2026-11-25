import { z } from "zod";

// RFC 5321 caps a forward/reverse path at 254 characters.
export const EMAIL_MAX_LENGTH = 254;

// Magic link tokens are 32 random bytes encoded as base64url (no padding): 43 chars.
export const MAGIC_LINK_TOKEN_LENGTH = 43;

export const magicLinkRequestSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(EMAIL_MAX_LENGTH, "E-mail muito longo")
    .email("Informe um e-mail válido"),
});

export type MagicLinkRequestInput = z.infer<typeof magicLinkRequestSchema>;

export const magicLinkVerifySchema = z.object({
  token: z
    .string()
    .trim()
    .length(MAGIC_LINK_TOKEN_LENGTH, "Link inválido")
    .regex(/^[A-Za-z0-9_-]+$/, "Link inválido"),
});

export type MagicLinkVerifyInput = z.infer<typeof magicLinkVerifySchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

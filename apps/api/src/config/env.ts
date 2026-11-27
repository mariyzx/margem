import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SMTP_HOST: z.string().trim().min(1).default("localhost"),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1).default("Margem <no-reply@margem.local>"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  MAGIC_LINK_DAILY_CAP: z.coerce.number().int().positive().default(300),
  LOG_HASH_SECRET: z.string().min(32).optional(),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  MAX_ACTIVE_SESSIONS_PER_USER: z.coerce.number().int().positive().default(10),
  MAX_NOTEBOOKS_PER_USER: z.coerce.number().int().positive().default(100),
  MAX_NOTES_PER_USER: z.coerce.number().int().positive().default(5000),
  MAX_SOURCES_PER_USER: z.coerce.number().int().positive().default(500),
  MAX_QUESTIONS_PER_USER: z.coerce.number().int().positive().default(10000),
  MAX_PRACTICE_ITEMS_PER_USER: z.coerce.number().int().positive().default(10000),
  MAX_SOURCE_STORAGE_MB_PER_USER: z.coerce.number().int().positive().default(500),
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  APP_VERSION: z.string().default("0.0.0"),
  GOOGLE_CLIENT_ID: z.string().trim().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional().or(z.literal("")),
  GOOGLE_REDIRECT_URI: z.string().trim().optional().or(z.literal("")),
  AWS_ACCESS_KEY_ID: z.string().trim().optional().or(z.literal("")),
  AWS_SECRET_ACCESS_KEY: z.string().trim().optional().or(z.literal("")),
  AWS_DEFAULT_REGION: z.string().trim().default("sa-saopaulo-1"),
  S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  S3_BUCKET: z.string().trim().optional().or(z.literal("")),
  ELASTICSEARCH_URL: z.string().url().optional().or(z.literal("")),
  OLLAMA_URL: z.string().url().optional().or(z.literal("")),
  OLLAMA_EMBED_MODEL: z.string().trim().min(1).default("nomic-embed-text"),
  OLLAMA_CHAT_MODEL: z.string().trim().min(1).default("qwen2.5:3b"),
  OLLAMA_CONTEXT_TOKENS: z.coerce.number().int().min(1024).default(8192),
  GROQ_CHAT_MODEL: z.string().trim().min(1).default("openai/gpt-oss-120b"),
  OPENROUTER_CHAT_MODEL: z
    .string()
    .trim()
    .regex(/:free$/, "OPENROUTER_CHAT_MODEL must be a :free model")
    .default("google/gemma-4-31b-it:free"),
  AI_CALLS_PER_MINUTE_PER_USER: z.coerce.number().int().positive().default(20),
  AI_KEYS_MASTER_KEY: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine(
      (value) => {
        if (!value) return true;
        const buf = Buffer.from(value, "base64");
        const isBase64 = buf.toString("base64") === value;
        return buf.length === 32 && isBase64;
      },
      {
        message: "AI_KEYS_MASTER_KEY must be base64 of exactly 32 bytes (openssl rand -base64 32)",
      },
    ),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.LOG_HASH_SECRET) {
    throw new Error("Invalid environment variables: LOG_HASH_SECRET is required in production");
  }
  if (parsed.data.NODE_ENV === "production" && !parsed.data.AI_KEYS_MASTER_KEY) {
    throw new Error("Invalid environment variables: AI_KEYS_MASTER_KEY is required in production");
  }
  return parsed.data;
}

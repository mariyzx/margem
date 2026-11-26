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
  /** HMAC key for ipHash/emailHash. Required in production (see loadEnv). */
  LOG_HASH_SECRET: z.string().min(32).optional(),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  MAX_ACTIVE_SESSIONS_PER_USER: z.coerce.number().int().positive().default(10),
  MAX_NOTEBOOKS_PER_USER: z.coerce.number().int().positive().default(100),
  MAX_NOTES_PER_USER: z.coerce.number().int().positive().default(5000),
  MAX_SOURCES_PER_USER: z.coerce.number().int().positive().default(500),
  MAX_QUESTIONS_PER_USER: z.coerce.number().int().positive().default(10000),
  /** Sum of uploaded PDF sizes per user, in MB. The free Object Storage is 20 GB in all. */
  MAX_SOURCE_STORAGE_MB_PER_USER: z.coerce.number().int().positive().default(500),
  SENTRY_DSN: z.string().url().optional().or(z.literal("")),
  APP_VERSION: z.string().default("0.0.0"),
  GOOGLE_CLIENT_ID: z.string().trim().optional().or(z.literal("")),
  GOOGLE_CLIENT_SECRET: z.string().trim().optional().or(z.literal("")),
  GOOGLE_REDIRECT_URI: z.string().trim().optional().or(z.literal("")),
  AWS_ACCESS_KEY_ID: z.string().trim().optional().or(z.literal("")),
  AWS_SECRET_ACCESS_KEY: z.string().trim().optional().or(z.literal("")),
  AWS_DEFAULT_REGION: z.string().trim().default("sa-saopaulo-1"),
  /** Upload bucket. Never falls back to BACKUP_S3_* (the Postgres dumps bucket). */
  S3_ENDPOINT: z.string().url().optional().or(z.literal("")),
  S3_BUCKET: z.string().trim().optional().or(z.literal("")),
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
  return parsed.data;
}

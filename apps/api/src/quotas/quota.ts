import { UnprocessableEntityException } from "@nestjs/common";
import { QUOTA_EXCEEDED_CODE, type QuotaExceededError, type QuotaResource } from "@margem/shared";
import { envSchema } from "../config/env";

const quotaEnvSchema = envSchema.pick({
  MAX_NOTEBOOKS_PER_USER: true,
  MAX_NOTES_PER_USER: true,
  MAX_SOURCES_PER_USER: true,
  MAX_QUESTIONS_PER_USER: true,
  MAX_SOURCE_STORAGE_MB_PER_USER: true,
});

const LIMIT_ENV: Record<QuotaResource, keyof typeof quotaEnvSchema.shape> = {
  notebooks: "MAX_NOTEBOOKS_PER_USER",
  notes: "MAX_NOTES_PER_USER",
  sources: "MAX_SOURCES_PER_USER",
  questions: "MAX_QUESTIONS_PER_USER",
  storage: "MAX_SOURCE_STORAGE_MB_PER_USER",
};

/** Resources capped by how many items the user owns (storage is capped by bytes instead). */
type CountedResource = Exclude<QuotaResource, "storage">;

const MASCULINE = { some: "algum", another: "outro" } as const;
const FEMININE = { some: "alguma", another: "outra" } as const;

const LABEL: Record<CountedResource, { noun: string } & (typeof MASCULINE | typeof FEMININE)> = {
  notebooks: { noun: "cadernos", ...MASCULINE },
  notes: { noun: "notas", ...FEMININE },
  sources: { noun: "materiais", ...MASCULINE },
  questions: { noun: "perguntas", ...FEMININE },
};

export function quotaLimit(resource: QuotaResource): number {
  // Only the quota variables: services stay usable without DATABASE_URL/REDIS_URL set.
  return quotaEnvSchema.parse(process.env)[LIMIT_ENV[resource]];
}

/**
 * Throws 422 when the user already owns `current` active items of `resource` and the
 * cap does not allow one more. Count with an indexed query before creating.
 */
export function assertWithinQuota(resource: CountedResource, current: number): void {
  const limit = quotaLimit(resource);
  if (current < limit) {
    return;
  }
  const { noun, some, another } = LABEL[resource];
  const body: QuotaExceededError = {
    code: QUOTA_EXCEEDED_CODE,
    resource,
    limit,
    message: `Você chegou ao limite de ${limit.toLocaleString("pt-BR")} ${noun}. Apague ${some} para criar ${another}.`,
  };
  throw new UnprocessableEntityException(body);
}

export const BYTES_PER_MB = 1024 * 1024;

/**
 * Throws 422 (`resource: "storage"`, `limit` in MB) when storing `incomingBytes` more
 * would take the user past MAX_SOURCE_STORAGE_MB_PER_USER. `usedBytes` is the sum of
 * `sizeBytes` of the user's file sources, soft-deleted ones included (their object is
 * still in the bucket).
 *
 * Refuses the file that would cross the cap (used + incoming), not only once the cap is
 * already reached, so one last big upload can never overshoot it.
 */
export function assertWithinStorageQuota(usedBytes: number, incomingBytes: number): void {
  const limitMb = quotaLimit("storage");
  if (usedBytes + incomingBytes <= limitMb * BYTES_PER_MB) {
    return;
  }
  const body: QuotaExceededError = {
    code: QUOTA_EXCEEDED_CODE,
    resource: "storage",
    limit: limitMb,
    message: `Você chegou ao limite de ${limitMb.toLocaleString("pt-BR")} MB em PDFs. Apague algum material para enviar outro.`,
  };
  throw new UnprocessableEntityException(body);
}

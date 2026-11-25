import { UnprocessableEntityException } from "@nestjs/common";
import { QUOTA_EXCEEDED_CODE, type QuotaExceededError, type QuotaResource } from "@margem/shared";
import { envSchema } from "../config/env";

const quotaEnvSchema = envSchema.pick({
  MAX_NOTEBOOKS_PER_USER: true,
  MAX_NOTES_PER_USER: true,
  MAX_SOURCES_PER_USER: true,
  MAX_QUESTIONS_PER_USER: true,
});

const LIMIT_ENV: Record<QuotaResource, keyof typeof quotaEnvSchema.shape> = {
  notebooks: "MAX_NOTEBOOKS_PER_USER",
  notes: "MAX_NOTES_PER_USER",
  sources: "MAX_SOURCES_PER_USER",
  questions: "MAX_QUESTIONS_PER_USER",
};

const MASCULINE = { some: "algum", another: "outro" } as const;
const FEMININE = { some: "alguma", another: "outra" } as const;

const LABEL: Record<QuotaResource, { noun: string } & (typeof MASCULINE | typeof FEMININE)> = {
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
export function assertWithinQuota(resource: QuotaResource, current: number): void {
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

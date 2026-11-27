import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { AiCredentialProvider as DbProvider, Prisma } from "@prisma/client";
import {
  aiFeaturesSchema,
  type AiCredentialProvider,
  type AiCredentialSummary,
  type AiSettings,
  type CreateAiCredentialInput,
  type UpdateAiSettingsInput,
} from "@margem/shared";
import { PrismaService } from "../prisma/prisma.service";
import { withAuditContext } from "../security/request-context";
import { encryptCredential, keyLast4, loadMasterKey } from "./credential-cipher";

/** Never select `encryptedKey` for a response: what leaves the API is only this. */
const CREDENTIAL_SUMMARY_SELECT = { provider: true, keyLast4: true, createdAt: true } as const;

/** AAD of a stored key: binds the ciphertext to its own row (see credential-cipher.ts). */
export function credentialContext(userId: string, provider: AiCredentialProvider): string {
  return `${userId}:${provider}`;
}

@Injectable()
export class AiSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the row with the defaults on first read, so every user has settings. */
  async get(userId: string): Promise<AiSettings> {
    const [settings, credentials] = await Promise.all([
      this.prisma.aiSettings.upsert({ where: { userId }, create: { userId }, update: {} }),
      this.prisma.aiCredential.findMany({
        where: { userId },
        select: CREDENTIAL_SUMMARY_SELECT,
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      enabled: settings.enabled,
      promptTarget: settings.promptTarget,
      features: readFeatures(settings.features),
      credentials: credentials.map(toCredentialSummary),
    };
  }

  /** Partial update: features the person did not send keep their stored value. */
  async update(userId: string, input: UpdateAiSettingsInput): Promise<AiSettings> {
    const current = await this.prisma.aiSettings.findUnique({
      where: { userId },
      select: { features: true },
    });
    const features = { ...readFeatures(current?.features), ...input.features };
    const data = { enabled: input.enabled, promptTarget: input.promptTarget, features };
    await this.prisma.aiSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.get(userId);
  }

  async saveCredential(
    userId: string,
    input: CreateAiCredentialInput,
  ): Promise<AiCredentialSummary> {
    const encryptedKey = encryptCredential(
      input.apiKey,
      credentialContext(userId, input.provider),
      masterKeyOrUnavailable(),
    );
    const last4 = keyLast4(input.apiKey);

    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.aiCredential.upsert({
        where: { userId_provider: { userId, provider: input.provider } },
        create: { userId, provider: input.provider, encryptedKey, keyLast4: last4 },
        // A pasted key replaces the old one: it is a new credential, so createdAt restarts.
        update: { encryptedKey, keyLast4: last4, createdAt: new Date() },
        select: CREDENTIAL_SUMMARY_SELECT,
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "ai_credential.saved",
          metadata: { provider: input.provider },
        }),
      });
      return row;
    });
    return toCredentialSummary(saved);
  }

  /** "Remover" deletes the row (docs/06-ia.md). 404 when there is nothing of this user to delete. */
  async removeCredential(userId: string, provider: AiCredentialProvider): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.aiCredential.deleteMany({ where: { userId, provider } });
      if (count === 0) {
        throw new NotFoundException("Resource not found");
      }
      await tx.auditLog.create({
        data: withAuditContext({ userId, action: "ai_credential.removed", metadata: { provider } }),
      });
    });
  }
}

/** The JSON column has no shape in Postgres; Zod gives it one (missing key = on). */
function readFeatures(stored: Prisma.JsonValue | undefined) {
  return aiFeaturesSchema.parse(stored ?? {});
}

function toCredentialSummary(row: {
  provider: DbProvider;
  keyLast4: string;
  createdAt: Date;
}): AiCredentialSummary {
  return { provider: row.provider, keyLast4: row.keyLast4, createdAt: row.createdAt.toISOString() };
}

/** Without the master key the API still runs, but can't store keys: 503, not a crash. */
function masterKeyOrUnavailable(): Buffer {
  try {
    return loadMasterKey();
  } catch {
    throw new ServiceUnavailableException("ai_keys_unavailable");
  }
}

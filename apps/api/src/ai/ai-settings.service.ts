import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { AiCredentialProvider as DbProvider, Prisma } from "@prisma/client";
import {
  aiFeaturesSchema,
  type AiCredentialProvider,
  type AiCredentialTestFailure,
  type AiCredentialSummary,
  type AiSettings,
  type CreateAiCredentialInput,
  type UpdateAiSettingsInput,
} from "@margem/shared";
import { PrismaService } from "../prisma/prisma.service";
import { withAuditContext } from "../security/request-context";
import { encryptCredential, keyLast4, loadMasterKey } from "./credential-cipher";
import { AiProviderClient, AiProviderError, remoteTarget } from "./provider-client";

const CREDENTIAL_SUMMARY_SELECT = { provider: true, keyLast4: true, createdAt: true } as const;

export function credentialContext(userId: string, provider: AiCredentialProvider): string {
  return `${userId}:${provider}`;
}

@Injectable()
export class AiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: AiProviderClient,
  ) {}

  async preferences(userId: string): Promise<Pick<AiSettings, "enabled" | "features">> {
    const row = await this.prisma.aiSettings.findUnique({
      where: { userId },
      select: { enabled: true, features: true },
    });
    return { enabled: row?.enabled ?? true, features: readFeatures(row?.features) };
  }

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
    masterKeyOrUnavailable();
    await this.testKey(input);
    return this.storeCredential(userId, input.provider, input.apiKey, "pasted");
  }

  async storeCredential(
    userId: string,
    provider: AiCredentialProvider,
    apiKey: string,
    via: "pasted" | "oauth",
  ): Promise<AiCredentialSummary> {
    const encryptedKey = encryptCredential(
      apiKey,
      credentialContext(userId, provider),
      masterKeyOrUnavailable(),
    );
    const last4 = keyLast4(apiKey);

    const saved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.aiCredential.upsert({
        where: { userId_provider: { userId, provider } },
        create: { userId, provider, encryptedKey, keyLast4: last4 },
        update: { encryptedKey, keyLast4: last4, createdAt: new Date() },
        select: CREDENTIAL_SUMMARY_SELECT,
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "ai_credential.saved",
          metadata: { provider, via },
        }),
      });
      return row;
    });
    return toCredentialSummary(saved);
  }

  private async testKey(input: CreateAiCredentialInput): Promise<void> {
    try {
      await this.providers.testKey(remoteTarget(input.provider, input.apiKey));
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      if (error.kind === "quota") return;
      if (error.kind === "invalid_key") {
        const body: AiCredentialTestFailure = { code: "invalid_key" };
        throw new BadRequestException(body);
      }
      const body: AiCredentialTestFailure = { code: "provider_unreachable" };
      throw new ServiceUnavailableException(body);
    }
  }

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

function masterKeyOrUnavailable(): Buffer {
  try {
    return loadMasterKey();
  } catch {
    throw new ServiceUnavailableException("ai_keys_unavailable");
  }
}

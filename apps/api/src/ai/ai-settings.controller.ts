import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  aiCredentialProviderSchema,
  createAiCredentialSchema,
  finishOpenRouterSchema,
  updateAiSettingsSchema,
} from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { AiSettingsService } from "./ai-settings.service";
import { OpenRouterOAuthService } from "./openrouter-oauth.service";

@Controller("ai")
export class AiSettingsController {
  constructor(
    private readonly aiSettings: AiSettingsService,
    private readonly openRouter: OpenRouterOAuthService,
  ) {}

  @Get("settings")
  @RequirePolicy("read", "user")
  async getSettings(@Req() req: AuthenticatedRequest) {
    return { settings: await this.aiSettings.get(req.user!.id) };
  }

  @Put("settings")
  @RequirePolicy("update", "user")
  async updateSettings(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = updateAiSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return { settings: await this.aiSettings.update(req.user!.id, parsed.data) };
  }

  @Post("credentials")
  @RequirePolicy("update", "user")
  async saveCredential(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = createAiCredentialSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return { credential: await this.aiSettings.saveCredential(req.user!.id, parsed.data) };
  }

  @Delete("credentials/:provider")
  @HttpCode(204)
  @RequirePolicy("update", "user")
  async removeCredential(@Req() req: AuthenticatedRequest, @Param("provider") provider: string) {
    const parsed = aiCredentialProviderSchema.safeParse(provider);
    if (!parsed.success) {
      throw new BadRequestException("Unknown provider");
    }
    await this.aiSettings.removeCredential(req.user!.id, parsed.data);
  }

  @Post("openrouter/connect")
  @HttpCode(200)
  @RequirePolicy("update", "user")
  connectOpenRouter(@Req() req: AuthenticatedRequest) {
    return this.openRouter.start(req.user!.id);
  }

  @Post("openrouter/finish")
  @RequirePolicy("update", "user")
  async finishOpenRouter(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = finishOpenRouterSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: "oauth_state_invalid" });
    }
    return { credential: await this.openRouter.finish(req.user!.id, parsed.data) };
  }
}

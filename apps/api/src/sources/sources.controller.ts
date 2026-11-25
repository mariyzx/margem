import { BadRequestException, Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { createTextSourceSchema } from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session.middleware";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { SourcesService } from "./sources.service";

@Controller("sources")
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post("text")
  @RequirePolicy("create", "notebook")
  async createText(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = createTextSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const source = await this.sourcesService.createText(req.user!.id, parsed.data);
    return { source };
  }

  @Get(":id")
  @RequirePolicy("read", "notebook")
  async getById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const source = await this.sourcesService.getById(req.user!.id, id);
    return { source };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { generatePracticeSchema } from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { PracticeService } from "./practice.service";

@Controller()
export class StudioController {
  constructor(private readonly practice: PracticeService) {}

  @Post("sources/:sourceId/practice/generate")
  @RequirePolicy("update", "notebook")
  generate(
    @Req() req: AuthenticatedRequest,
    @Param("sourceId") sourceId: string,
    @Body() body: unknown,
  ) {
    const parsed = generatePracticeSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.practice.generate(req.user!.id, sourceId, parsed.data);
  }

  @Get("sources/:sourceId/practice")
  @RequirePolicy("read", "notebook")
  list(@Req() req: AuthenticatedRequest, @Param("sourceId") sourceId: string) {
    return this.practice.listForSource(req.user!.id, sourceId);
  }

  @Post("practice/:id/approve")
  @HttpCode(200)
  @RequirePolicy("update", "notebook")
  async approve(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return { item: await this.practice.approve(req.user!.id, id) };
  }

  @Post("practice/:id/discard")
  @HttpCode(200)
  @RequirePolicy("update", "notebook")
  discard(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.practice.discard(req.user!.id, id);
  }
}

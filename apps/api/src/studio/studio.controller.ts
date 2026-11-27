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
import { askNotebookSchema, generatePracticeSchema } from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { AskNotebookService } from "./ask-notebook.service";
import { PracticeService } from "./practice.service";
import { StudioOverviewService } from "./studio-overview.service";

@Controller()
export class StudioController {
  constructor(
    private readonly practice: PracticeService,
    private readonly askNotebook: AskNotebookService,
    private readonly studioOverview: StudioOverviewService,
  ) {}

  @Get("notebooks/:notebookId/studio")
  @RequirePolicy("read", "notebook")
  overview(@Req() req: AuthenticatedRequest, @Param("notebookId") notebookId: string) {
    return this.studioOverview.overview(req.user!.id, notebookId);
  }

  @Post("notebooks/:notebookId/ask")
  @HttpCode(200)
  @RequirePolicy("read", "notebook")
  ask(
    @Req() req: AuthenticatedRequest,
    @Param("notebookId") notebookId: string,
    @Body() body: unknown,
  ) {
    const parsed = askNotebookSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.askNotebook.ask(req.user!.id, notebookId, parsed.data);
  }

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

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import {
  checkMemoryGapsSchema,
  createLinkSourceSchema,
  createTextSourceSchema,
} from "@margem/shared";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { PDF_UPLOAD_OPTIONS } from "./pdf-validation";
import { MemoryGapsAiService } from "./memory-gaps-ai.service";
import { SourcesService } from "./sources.service";
import { AuthenticatedRequest } from "../auth/session";

interface UploadedPdfFile {
  buffer: Buffer;
  originalname?: string;
}

@Controller("sources")
export class SourcesController {
  constructor(
    private readonly sourcesService: SourcesService,
    private readonly memoryGapsAi: MemoryGapsAiService,
  ) {}

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

  @Post("link")
  @RequirePolicy("create", "notebook")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async createLink(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = createLinkSourceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const source = await this.sourcesService.createLink(req.user!.id, parsed.data);
    return { source };
  }

  @Post("file")
  @RequirePolicy("create", "notebook")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor("file", PDF_UPLOAD_OPTIONS))
  async uploadFile(
    @Req() req: AuthenticatedRequest,
    @UploadedFile() file: UploadedPdfFile | undefined,
    @Body("notebookId") notebookId: unknown,
    @Body("title") title: unknown,
  ) {
    if (!file) {
      throw new BadRequestException("PDF file is required");
    }
    if (typeof notebookId !== "string" || !notebookId.trim()) {
      throw new BadRequestException("notebookId is required");
    }
    const resolvedTitle =
      typeof title === "string" && title.trim() ? title : file.originalname || "Documento.pdf";

    const source = await this.sourcesService.createFile(req.user!.id, {
      notebookId: notebookId.trim(),
      title: resolvedTitle,
      buffer: file.buffer,
    });
    return { source };
  }

  @Get("memory-gaps")
  @RequirePolicy("read", "notebook")
  async getMemoryGaps(
    @Req() req: AuthenticatedRequest,
    @Query("noteId") noteId: string | undefined,
  ) {
    if (!noteId?.trim()) {
      throw new BadRequestException("noteId is required");
    }
    return this.sourcesService.getMemoryGaps(req.user!.id, noteId.trim());
  }

  @Post("memory-gaps/check")
  @HttpCode(200)
  @RequirePolicy("read", "notebook")
  async checkMemoryGaps(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = checkMemoryGapsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.memoryGapsAi.check(req.user!.id, parsed.data.noteId);
  }

  @Get(":id")
  @RequirePolicy("read", "notebook")
  async getById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const source = await this.sourcesService.getById(req.user!.id, id);
    return { source };
  }

  @Get(":id/chunks")
  @RequirePolicy("read", "notebook")
  listChunks(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sourcesService.listChunks(req.user!.id, id);
  }

  @Get(":id/file")
  @RequirePolicy("read", "notebook")
  async getFileUrl(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const url = await this.sourcesService.getSignedFileUrl(req.user!.id, id);
    return { url };
  }

  @Delete(":id")
  @RequirePolicy("delete", "notebook")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.sourcesService.remove(req.user!.id, id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { createLinkSourceSchema, createTextSourceSchema } from "@margem/shared";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { MAX_PDF_BYTES } from "./pdf-validation";
import { SourcesService } from "./sources.service";
import { AuthenticatedRequest } from "../auth/session";

interface UploadedPdfFile {
  buffer: Buffer;
  originalname?: string;
}

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
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_PDF_BYTES },
    }),
  )
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

  @Get(":id")
  @RequirePolicy("read", "notebook")
  async getById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const source = await this.sourcesService.getById(req.user!.id, id);
    return { source };
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

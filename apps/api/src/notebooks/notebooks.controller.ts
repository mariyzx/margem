import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { createNotebookSchema, updateNotebookSchema } from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session";
import { parsePagination } from "../common/pagination";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { NotebooksService } from "./notebooks.service";

@Controller("notebooks")
export class NotebooksController {
  constructor(private readonly notebooksService: NotebooksService) {}

  @Get()
  @RequirePolicy("read", "notebook")
  list(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    return this.notebooksService.listForUser(req.user!.id, parsePagination(query));
  }

  @Get(":id/notes")
  @RequirePolicy("read", "notebook")
  listNotes(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Query() query: unknown) {
    return this.notebooksService.listNotes(req.user!.id, id, parsePagination(query));
  }

  @Post()
  @RequirePolicy("create", "notebook")
  async create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = createNotebookSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const notebook = await this.notebooksService.create(req.user!.id, parsed.data);
    return { notebook };
  }

  @Patch(":id")
  @RequirePolicy("update", "notebook")
  async update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    const parsed = updateNotebookSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const notebook = await this.notebooksService.update(req.user!.id, id, parsed.data);
    return { notebook };
  }

  @Delete(":id")
  @RequirePolicy("delete", "notebook")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.notebooksService.remove(req.user!.id, id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { createNotebookSchema, updateNotebookSchema } from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session.middleware";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { NotebooksService } from "./notebooks.service";

@Controller("notebooks")
export class NotebooksController {
  constructor(private readonly notebooksService: NotebooksService) {}

  @Get()
  @RequirePolicy("read", "notebook")
  async list(@Req() req: AuthenticatedRequest) {
    const notebooks = await this.notebooksService.listForUser(req.user!.id);
    return { notebooks };
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

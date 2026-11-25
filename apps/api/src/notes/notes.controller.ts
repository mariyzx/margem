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
import { createNoteSchema, updateNoteSchema } from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { NotesService } from "./notes.service";

@Controller("notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get(":id")
  @RequirePolicy("read", "note")
  async getById(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const note = await this.notesService.getById(req.user!.id, id);
    return { note };
  }

  @Post()
  @RequirePolicy("create", "note")
  async create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = createNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const note = await this.notesService.create(req.user!.id, parsed.data);
    return { note };
  }

  @Patch(":id")
  @RequirePolicy("update", "note")
  async update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    const parsed = updateNoteSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const note = await this.notesService.update(req.user!.id, id, parsed.data);
    return { note };
  }

  @Delete(":id")
  @RequirePolicy("delete", "note")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.notesService.remove(req.user!.id, id);
  }
}

import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";

@Module({
  imports: [PoliciesModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}

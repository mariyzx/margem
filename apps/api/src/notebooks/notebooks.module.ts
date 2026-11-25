import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { NotebooksController } from "./notebooks.controller";
import { NotebooksService } from "./notebooks.service";

@Module({
  imports: [PoliciesModule],
  controllers: [NotebooksController],
  providers: [NotebooksService],
})
export class NotebooksModule {}

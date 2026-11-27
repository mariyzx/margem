import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PoliciesModule } from "../policies/policies.module";
import { SearchModule } from "../search/search.module";
import { AskNotebookService } from "./ask-notebook.service";
import { PracticeService } from "./practice.service";
import { StudioController } from "./studio.controller";

@Module({
  imports: [PoliciesModule, AiModule, SearchModule],
  controllers: [StudioController],
  providers: [PracticeService, AskNotebookService],
})
export class StudioModule {}

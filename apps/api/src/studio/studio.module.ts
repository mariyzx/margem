import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PoliciesModule } from "../policies/policies.module";
import { SearchModule } from "../search/search.module";
import { AskNotebookService } from "./ask-notebook.service";
import { PracticeService } from "./practice.service";
import { StudioController } from "./studio.controller";
import { StudioOverviewService } from "./studio-overview.service";

@Module({
  imports: [PoliciesModule, AiModule, SearchModule],
  controllers: [StudioController],
  providers: [PracticeService, AskNotebookService, StudioOverviewService],
})
export class StudioModule {}

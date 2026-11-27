import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PoliciesModule } from "../policies/policies.module";
import { SourceIngestQueue } from "./source-ingest.queue";
import { MemoryGapsAiService } from "./memory-gaps-ai.service";
import { SourcesController } from "./sources.controller";
import { SourcesService } from "./sources.service";
import { StorageService } from "./storage.service";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PoliciesModule, SearchModule, AiModule],
  controllers: [SourcesController],
  providers: [SourcesService, SourceIngestQueue, StorageService, MemoryGapsAiService],
  exports: [SourceIngestQueue],
})
export class SourcesModule {}

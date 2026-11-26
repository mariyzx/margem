import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { SourceIngestQueue } from "./source-ingest.queue";
import { SourcesController } from "./sources.controller";
import { SourcesService } from "./sources.service";
import { StorageService } from "./storage.service";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [PoliciesModule, SearchModule],
  controllers: [SourcesController],
  providers: [SourcesService, SourceIngestQueue, StorageService],
  exports: [SourceIngestQueue],
})
export class SourcesModule {}

import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { SourceIngestQueue } from "./source-ingest.queue";
import { SourcesController } from "./sources.controller";
import { SourcesService } from "./sources.service";

@Module({
  imports: [PoliciesModule],
  controllers: [SourcesController],
  providers: [SourcesService, SourceIngestQueue],
  exports: [SourceIngestQueue],
})
export class SourcesModule {}

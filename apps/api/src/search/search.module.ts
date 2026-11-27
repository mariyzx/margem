import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { EmbeddingsService } from "./embeddings.service";
import { NotebookContextService } from "./notebook-context.service";
import { SearchController } from "./search.controller";
import { SearchIndexService } from "./search-index.service";
import { SearchService } from "./search.service";

@Module({
  imports: [PoliciesModule],
  controllers: [SearchController],
  providers: [EmbeddingsService, SearchIndexService, SearchService, NotebookContextService],
  exports: [EmbeddingsService, SearchIndexService, NotebookContextService],
})
export class SearchModule {}

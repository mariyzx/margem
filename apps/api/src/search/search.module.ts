import { Module } from "@nestjs/common";
import { EmbeddingsService } from "./embeddings.service";
import { SearchIndexService } from "./search-index.service";

@Module({
  providers: [EmbeddingsService, SearchIndexService],
  exports: [EmbeddingsService, SearchIndexService],
})
export class SearchModule {}

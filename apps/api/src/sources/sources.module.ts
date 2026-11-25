import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { SourcesController } from "./sources.controller";
import { SourcesService } from "./sources.service";

@Module({
  imports: [PoliciesModule],
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}

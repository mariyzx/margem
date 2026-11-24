import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PolicyGuard } from "./policy.guard";
import { PolicyService } from "./policy.service";

@Global()
@Module({
  providers: [PolicyService, { provide: APP_GUARD, useClass: PolicyGuard }],
  exports: [PolicyService],
})
export class PoliciesModule {}

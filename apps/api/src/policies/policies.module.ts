import { Global, Module } from "@nestjs/common";
import { PolicyService } from "./policy.service";

// PolicyGuard is registered globally in SecurityModule (GLOBAL_GUARDS), after the
// throttlers and SessionGuard, so the order between them is explicit.
@Global()
@Module({
  providers: [PolicyService],
  exports: [PolicyService],
})
export class PoliciesModule {}

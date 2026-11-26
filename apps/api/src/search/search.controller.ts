import { BadRequestException, Controller, Get, Query, Req } from "@nestjs/common";
import { searchQuerySchema } from "@margem/shared";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { SearchService } from "./search.service";
import { AuthenticatedRequest } from "../auth/session";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @RequirePolicy("read", "notebook")
  async search(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const parsed = searchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const hits = await this.searchService.search(req.user!.id, parsed.data);
    return { hits };
  }
}

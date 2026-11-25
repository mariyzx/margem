import { BadRequestException, Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { enqueueStudyErrorsSchema, submitReviewSchema } from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session.middleware";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { ReviewsService } from "./reviews.service";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get("due")
  @RequirePolicy("read", "note")
  async listDue(@Req() req: AuthenticatedRequest) {
    const cards = await this.reviewsService.listDue(req.user!.id);
    return { cards };
  }

  @Post(":id/submit")
  @RequirePolicy("update", "note")
  async submit(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    const parsed = submitReviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.reviewsService.submitReview(req.user!.id, id, parsed.data.rating);
  }

  @Post("study-errors")
  @RequirePolicy("update", "note")
  async enqueueStudyErrors(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = enqueueStudyErrorsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.reviewsService.enqueueStudyErrors(req.user!.id, parsed.data);
  }
}

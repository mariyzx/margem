import { HttpException, HttpStatus } from "@nestjs/common";
import {
  AI_UNAVAILABLE_CODE,
  type AiUnavailableError,
  type AiUnavailableReason,
} from "@margem/shared";

export class AiUnavailableException extends HttpException {
  constructor(readonly reason: AiUnavailableReason) {
    const body: AiUnavailableError = { code: AI_UNAVAILABLE_CODE, reason };
    super(
      body,
      reason === "rate_limited" ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

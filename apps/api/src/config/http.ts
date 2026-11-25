import type { Server } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";

/** Kept in sync with `request_body max_size` in infra/caddy/Caddyfile. */
export const BODY_LIMIT = "1mb";

export const HTTP_TIMEOUTS = {
  /** Time allowed to receive the full request headers. */
  headersTimeoutMs: 15_000,
  /** Whole request; the magic link send can take up to ~35s on a slow SMTP. */
  requestTimeoutMs: 45_000,
  /**
   * Must outlive the proxy's upstream keepalive (60s in infra/caddy/Caddyfile), so Caddy
   * always drops an idle socket before Node does and never reuses a closed one (502).
   */
  keepAliveTimeoutMs: 65_000,
} as const;

export function applyBodyLimits(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: BODY_LIMIT });
  app.useBodyParser("urlencoded", { limit: BODY_LIMIT, extended: true });
}

export function applyServerTimeouts(server: Server): void {
  server.headersTimeout = HTTP_TIMEOUTS.headersTimeoutMs;
  server.requestTimeout = HTTP_TIMEOUTS.requestTimeoutMs;
  server.keepAliveTimeout = HTTP_TIMEOUTS.keepAliveTimeoutMs;
}

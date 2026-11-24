import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Params } from "nestjs-pino";
import type { Env } from "./env";

export function createLoggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId(req: IncomingMessage) {
        const header = req.headers["x-request-id"];
        if (typeof header === "string" && header.length > 0) {
          return header;
        }
        return randomUUID();
      },
      customProps(req: IncomingMessage & { id?: unknown }) {
        return {
          trace_id: typeof req.id === "string" ? req.id : undefined,
        };
      },
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "res.headers['set-cookie']",
          "req.remoteAddress",
          "*.password",
          "*.token",
          "*.apiKey",
          "*.email",
        ],
        censor: "[REDACTED]",
      },
      formatters: {
        level(label: string) {
          return { level: label };
        },
      },
    },
  };
}

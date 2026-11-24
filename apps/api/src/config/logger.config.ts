import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Params } from "nestjs-pino";
import type { Env } from "./env";

export function createLoggerParams(env: Env): Params {
  const isDev = env.NODE_ENV === "development";

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
      serializers: {
        req(req: IncomingMessage & { id?: unknown; method?: string; url?: string }) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
          };
        },
        res(res: { statusCode?: number }) {
          return {
            statusCode: res.statusCode,
          };
        },
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
      ...(isDev
        ? {
            transport: {
              target: "pino-pretty",
              options: {
                colorize: true,
                singleLine: true,
                translateTime: "SYS:HH:MM:ss",
                ignore: "pid,hostname",
              },
            },
          }
        : {
            formatters: {
              level(label: string) {
                return { level: label };
              },
            },
          }),
    },
  };
}

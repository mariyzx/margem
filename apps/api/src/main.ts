import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { initApiSentry } from "./observability/sentry";
import { applyBodyLimits, applyServerTimeouts } from "./config/http";

async function bootstrap() {
  const env = loadEnv();
  initApiSentry(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  applyBodyLimits(app);
  applyServerTimeouts(app.getHttpServer() as Server);
  if (env.NODE_ENV === "production") {
    const httpAdapter = app.getHttpAdapter().getInstance() as {
      set?: (k: string, v: unknown) => void;
    };
    httpAdapter.set?.("trust proxy", 1);
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      hsts: env.NODE_ENV === "production",
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: env.APP_URL,
    credentials: true,
  });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  await app.listen(env.API_PORT);
}

void bootstrap();

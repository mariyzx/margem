import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { type ClientFingerprint, clientFingerprint } from "./client-fingerprint";

interface RequestContext {
  req: Request;
  fingerprint?: ClientFingerprint;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Makes the current request reachable from services (AuditLog writes) without threading
 * `req` through every call. It only stores a reference: no I/O, no database, so it is
 * safe to run before the throttlers.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    storage.run({ req }, () => next());
  }
}

/** Fingerprint of the request being handled, computed once; null outside a request (jobs). */
export function currentFingerprint(): ClientFingerprint | null {
  const ctx = storage.getStore();
  if (!ctx) {
    return null;
  }
  ctx.fingerprint ??= clientFingerprint(ctx.req);
  return ctx.fingerprint;
}

/** Runs `fn` as if it were handling `req` (tests and non-HTTP entry points). */
export function runWithRequest<T>(req: Request, fn: () => T): T {
  return storage.run({ req }, fn);
}

/** Adds ipHash/userAgent of the current request to an AuditLog `data` object. */
export function withAuditContext<T extends object>(
  data: T,
): T & { ipHash?: string; userAgent?: string | null } {
  const fp = currentFingerprint();
  return fp ? { ...data, ipHash: fp.ipHash, userAgent: fp.userAgent } : data;
}

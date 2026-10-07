/**
 * Next.js server-side Sentry init helper.
 *
 * Used by each app's `instrumentation.ts`:
 *
 *   import { initSentryNextServer } from "@dilivygo/observability/next/server";
 *   export async function register() {
 *     if (process.env.NEXT_RUNTIME === "nodejs") {
 *       await initSentryNextServer({
 *         surface: "vendor-web",
 *         dsn: process.env.SENTRY_DSN,
 *       });
 *     }
 *   }
 *
 * No-op when `dsn` is missing so dev / preview environments don't ship
 * events.
 */

import {
  defaultTracesSampleRate,
  makeBeforeSend,
  resolveDsn,
  resolveEnvironment,
  SENTRY_IGNORE_ERRORS,
  type SentryAppOptions,
} from "./shared";

export async function initSentryNextServer(opts: SentryAppOptions): Promise<boolean> {
  const dsn = resolveDsn(opts);
  if (!dsn) return false;

  const Sentry = await import("@sentry/nextjs");

  Sentry.init({
    dsn,
    environment: resolveEnvironment(opts),
    release: opts.release || undefined,
    tracesSampleRate: defaultTracesSampleRate(opts),
    sendDefaultPii: false,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    beforeSend: makeBeforeSend() as never,
    initialScope: {
      tags: { surface: opts.surface, runtime: "node" },
    },
  });
  return true;
}

export async function initSentryNextEdge(opts: SentryAppOptions): Promise<boolean> {
  const dsn = resolveDsn(opts);
  if (!dsn) return false;

  const Sentry = await import("@sentry/nextjs");

  Sentry.init({
    dsn,
    environment: resolveEnvironment(opts),
    release: opts.release || undefined,
    tracesSampleRate: defaultTracesSampleRate(opts),
    sendDefaultPii: false,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    beforeSend: makeBeforeSend() as never,
    initialScope: {
      tags: { surface: opts.surface, runtime: "edge" },
    },
  });
  return true;
}

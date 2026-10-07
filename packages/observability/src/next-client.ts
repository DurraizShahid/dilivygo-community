/**
 * Next.js browser-side Sentry init helper. Used from each app's
 * `instrumentation-client.ts` (Next 15+) or top-level layout.
 *
 *   import { initSentryNextClient } from "@dilivygo/observability/next/client";
 *   initSentryNextClient({
 *     surface: "customer-web",
 *     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
 *   });
 *
 * No-op when `dsn` is missing.
 */

import {
  defaultTracesSampleRate,
  makeBeforeSend,
  resolveDsn,
  resolveEnvironment,
  SENTRY_IGNORE_ERRORS,
  type SentryAppOptions,
} from "./shared";

export async function initSentryNextClient(opts: SentryAppOptions): Promise<boolean> {
  const dsn = resolveDsn(opts);
  if (!dsn) return false;

  const Sentry = await import("@sentry/nextjs");

  Sentry.init({
    dsn,
    environment: resolveEnvironment(opts),
    release: opts.release || undefined,
    tracesSampleRate: defaultTracesSampleRate(opts),
    // Replays are off by default (cost) — apps can override later.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    beforeSend: makeBeforeSend() as never,
    initialScope: {
      tags: { surface: opts.surface, runtime: "browser" },
    },
  });
  return true;
}

/**
 * Browser-side helper to attach the active org / user / role to all
 * subsequent events. Call from your auth provider whenever the session
 * changes; pass `null` to clear.
 */
export async function setSentryUserContext(input: {
  userId?: string | null;
  role?: string | null;
  organizationId?: string | null;
  projectRef?: string | null;
}): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.getCurrentScope().setTags({
      organization_id: input.organizationId || null,
      project_ref: input.projectRef || null,
      role: input.role || null,
    });
    if (input.userId) {
      Sentry.setUser({ id: String(input.userId) });
    } else {
      Sentry.setUser(null);
    }
  } catch {
    /* Sentry not initialised — ignore. */
  }
}

/**
 * Shared Sentry init options used by both server + browser bundles in every
 * Next.js app (customer / vendor / rider / superadmin / saas / pos).
 *
 * Each app passes its `surface` so we can filter alerts in Sentry by the
 * frontend that produced them. We also strip cookies / form bodies before
 * sending events because they may contain session ids or PII.
 */

export interface SentryAppOptions {
  /** Which Dilivygo surface — used as a tag on every event. */
  surface:
    | "customer-web"
    | "vendor-web"
    | "rider-web"
    | "superadmin-web"
    | "saas-web"
    | "pos-web"
    | "customer-mobile"
    | "rider-mobile"
    | "vendor-mobile"
    | "server";
  /** DSN. When falsy, init becomes a no-op. */
  dsn?: string | null;
  /** Build-time release identifier (commit SHA, tag, etc.). */
  release?: string | null;
  /** Environment tag — defaults to NODE_ENV. */
  environment?: string | null;
  /** Trace sample rate. Defaults to 5% in production, 0 in dev. */
  tracesSampleRate?: number;
}

export function resolveDsn(opts: SentryAppOptions): string | null {
  if (!opts.dsn) return null;
  const trimmed = String(opts.dsn).trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveEnvironment(opts: SentryAppOptions): string {
  return (
    opts.environment ||
    (typeof process !== "undefined" ? process.env.NODE_ENV : null) ||
    "development"
  );
}

export function defaultTracesSampleRate(opts: SentryAppOptions): number {
  if (typeof opts.tracesSampleRate === "number") return opts.tracesSampleRate;
  const env = resolveEnvironment(opts);
  return env === "production" ? 0.05 : 0;
}

export const SENTRY_IGNORE_ERRORS: (string | RegExp)[] = [
  // Network blips that aren't actionable.
  /Failed to fetch/i,
  /NetworkError when attempting to fetch/i,
  /Load failed/i,
  /AbortError/i,
  // Browser extensions injecting noise.
  /ResizeObserver loop completed with undelivered notifications/i,
  /ResizeObserver loop limit exceeded/i,
  // Common chunk-load races during deploys.
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
];

/**
 * `beforeSend` shared between server + client. Removes obvious sources of
 * PII and drops events that we know are user-actionable rather than bugs.
 */
export function makeBeforeSend(): (event: unknown) => unknown {
  return function beforeSend(event: unknown) {
    const e = event as {
      request?: { cookies?: unknown; data?: unknown; headers?: Record<string, unknown> };
      user?: { email?: unknown; username?: unknown; ip_address?: unknown };
    };
    if (e?.request) {
      delete e.request.cookies;
      delete e.request.data;
      if (e.request.headers) {
        delete e.request.headers.cookie;
        delete e.request.headers.authorization;
      }
    }
    if (e?.user) {
      delete e.user.email;
      delete e.user.username;
      delete e.user.ip_address;
    }
    return event;
  };
}

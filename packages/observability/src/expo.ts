/**
 * Shared Sentry init for the 3 Expo apps (customer-mobile / rider-mobile /
 * vendor-mobile). Use from each app's root layout:
 *
 *   import { initSentryExpo } from "@dilivygo/observability/expo";
 *   initSentryExpo({
 *     surface: "customer-mobile",
 *     dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
 *   });
 *
 * No-op when `dsn` is falsy.
 */

import {
  defaultTracesSampleRate,
  makeBeforeSend,
  resolveDsn,
  resolveEnvironment,
  SENTRY_IGNORE_ERRORS,
} from "./shared";

export type ExpoSurface = "customer-mobile" | "rider-mobile" | "vendor-mobile";

export interface ExpoSentryOptions {
  surface: ExpoSurface;
  dsn?: string | null;
  release?: string | null;
  environment?: string | null;
  tracesSampleRate?: number;
}

let _initialized = false;

export function initSentryExpo(opts: ExpoSentryOptions): boolean {
  if (_initialized) return true;
  const dsn = resolveDsn({ surface: opts.surface, dsn: opts.dsn });
  if (!dsn) return false;

  // Lazy require so apps without the SDK installed (or running in tests) don't
  // explode at import time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
  const Sentry = require("@sentry/react-native") as any;

  Sentry.init({
    dsn,
    environment: resolveEnvironment({
      surface: opts.surface,
      dsn,
      environment: opts.environment,
    }),
    release: opts.release || undefined,
    tracesSampleRate: defaultTracesSampleRate({
      surface: opts.surface,
      dsn,
      tracesSampleRate: opts.tracesSampleRate,
    }),
    sendDefaultPii: false,
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    beforeSend: makeBeforeSend(),
  });

  Sentry.getCurrentScope().setTags({
    surface: opts.surface,
    runtime: "react-native",
  });

  _initialized = true;
  return true;
}

/**
 * Attach the active customer/rider/vendor + workspace + role to all subsequent
 * events. Call from the auth provider when the session changes; pass `null`
 * everywhere to clear.
 */
export function setSentryUserContextExpo(input: {
  userId?: string | null;
  role?: string | null;
  organizationId?: string | null;
  projectRef?: string | null;
}): void {
  if (!_initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Sentry = require("@sentry/react-native") as any;
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
    /* SDK not loaded, ignore */
  }
}

/**
 * Wrap the root component so navigation traces + automatic touch events flow
 * to Sentry. Returns the original component unchanged when the SDK isn't
 * initialised so dev/preview without DSN is unaffected.
 */
export function wrapRootForSentry<T>(component: T): T {
  if (!_initialized) return component;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Sentry = require("@sentry/react-native") as any;
    if (typeof Sentry.wrap === "function") {
      return Sentry.wrap(component);
    }
  } catch {
    /* ignore */
  }
  return component;
}

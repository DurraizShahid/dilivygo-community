/**
 * Optional next.config wrapper. Only enables source-map upload + Sentry's
 * webpack plugin when SENTRY_AUTH_TOKEN + SENTRY_ORG + SENTRY_PROJECT_*
 * are configured (i.e. CI). In dev / preview it returns the config as-is.
 */

import type { NextConfig } from "next";

export interface SentryWrapOptions {
  /** Sentry org slug. */
  org?: string | null;
  /** Sentry project slug for this surface (e.g. `dilivygo-customer-web`). */
  project?: string | null;
  /** Auth token (CI only). */
  authToken?: string | null;
  /** Suppress sourceMap upload — useful for local builds. */
  silent?: boolean;
}

export async function withSentry(
  config: NextConfig,
  opts: SentryWrapOptions = {},
): Promise<NextConfig> {
  const authToken = opts.authToken ?? process.env.SENTRY_AUTH_TOKEN ?? null;
  const org = opts.org ?? process.env.SENTRY_ORG ?? null;
  const project = opts.project ?? process.env.SENTRY_PROJECT ?? null;

  if (!authToken || !org || !project) {
    return config;
  }

  const { withSentryConfig } = await import("@sentry/nextjs");
  return withSentryConfig(config, {
    org,
    project,
    authToken,
    silent: opts.silent ?? true,
    widenClientFileUpload: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  }) as NextConfig;
}

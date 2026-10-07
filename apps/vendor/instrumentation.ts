import { initSentryNextEdge, initSentryNextServer } from "@dilivygo/observability/next/server";

const SURFACE = "vendor-web" as const;

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await initSentryNextServer({
      surface: SURFACE,
      dsn: process.env.SENTRY_DSN,
      release: process.env.NEXT_PUBLIC_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA,
    });
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await initSentryNextEdge({
      surface: SURFACE,
      dsn: process.env.SENTRY_DSN,
      release: process.env.NEXT_PUBLIC_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA,
    });
  }
}

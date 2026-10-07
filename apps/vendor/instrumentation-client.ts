import { initSentryNextClient } from "@dilivygo/observability/next/client";

void initSentryNextClient({
  surface: "vendor-web",
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_RELEASE_SHA,
});

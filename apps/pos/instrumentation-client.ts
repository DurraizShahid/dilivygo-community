import { initSentryNextClient } from "@dilivygo/observability/next/client";

void initSentryNextClient({
  surface: "pos-web",
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_RELEASE_SHA,
});

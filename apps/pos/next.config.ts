import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { loadEnvConfig } from "@next/env";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(monorepoRoot);

/** Same-origin `/api` so `admin_session` + CSRF cookies work (see `src/lib/api.ts`). */
const POS_API_PROXY_TARGET =
  process.env.POS_API_PROXY_TARGET ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8080";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@dilivygo/api",
    "@dilivygo/i18n",
    "@dilivygo/logos",
    "@dilivygo/observability",
    "@dilivygo/tenant-host",
    "@dilivygo/types",
    "@dilivygo/ui",
  ],
  turbopack: { root: path.resolve(__dirname, "../..") },
  async rewrites() {
    const base = POS_API_PROXY_TARGET.replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${base}/api/:path*` }];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);

import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { loadEnvConfig } from "@next/env";
import path from "path";

const monorepoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(monorepoRoot);

const nextConfig: NextConfig = {
  /** Webpack (`next build --webpack`, e.g. `npm run analyze`) compiles these; Turbopack already handles them. */
  transpilePackages: [
    "@dilivygo/api",
    "@dilivygo/i18n",
    "@dilivygo/logos",
    "@dilivygo/observability",
    "@dilivygo/tenant-host",
    "@dilivygo/types",
    "@dilivygo/ui",
  ],
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  turbopack: { root: path.resolve(__dirname, "../..") },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8080";
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/ws", destination: `${apiUrl}/ws` },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);

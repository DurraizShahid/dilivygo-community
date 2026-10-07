import { createApiClient } from "@dilivygo/api";

const TOKEN_KEY = "dilivygo_customer_token";

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

const DEFAULT_API_URL =
  process.env.NODE_ENV === "production"
    ? "https://insightful-grace-production-9fd7.up.railway.app"
    : "http://localhost:8080";

const SERVER_API_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
const API_URL =
  typeof window === "undefined"
    ? SERVER_API_URL
    : process.env.NODE_ENV === "production"
      ? SERVER_API_URL
      : "";

export const api = createApiClient(API_URL, {
  getAuthToken,
  /** Prefer `customer_session` over `admin_session` when both exist (same API origin). */
  defaultHeaders: { "x-dilivygo-actor": "customer" },
});

// NOTE: In production, NEXT_PUBLIC_API_URL is set at build time.
// CORS (apps/server/config/cors.js) dynamically allows all
// {ref}.{surface}.{SAAS_DNS_APEX} origins via isSaasTenantWebOrigin,
// so custom domains work even when the API URL is the platform host.
// Tenant-specific server URLs (for redirects, email links, etc.)
// are derived from the verified host via config.getPublicServerUrl(req).

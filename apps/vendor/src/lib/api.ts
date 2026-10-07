import { createApiClient } from "@dilivygo/api";

const PRODUCTION_API = "https://insightful-grace-production-9fd7.up.railway.app";

/**
 * Prefer same-origin `/api` (Next rewrites → Railway) whenever the public API host
 * differs from the page host. That keeps `admin_session` + CSRF cookies first-party
 * (critical on Vercel + a separate API host; multipart uploads are especially sensitive
 * to third-party cookie / session issues).
 *
 * In local dev, if `NEXT_PUBLIC_API_URL` uses a different hostname than the page
 * (e.g. `127.0.0.1` while you open `http://localhost:…`), browsers will not send cookies
 * → we fall back to relative `/api` in that case too.
 */
function resolveVendorApiBaseUrl(): string {
  const isProd = process.env.NODE_ENV === "production";
  const envUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/$/, "");

  if (typeof window !== "undefined") {
    if (!envUrl) {
      return isProd ? PRODUCTION_API : "";
    }
    try {
      const apiHost = new URL(envUrl).hostname;
      if (apiHost !== window.location.hostname) {
        return "";
      }
    } catch {
      return "";
    }
    return envUrl;
  }

  // SSR / server: no browser — call API directly (matches `next.config` rewrite target)
  if (isProd) {
    return envUrl || PRODUCTION_API;
  }
  return envUrl || "http://127.0.0.1:8080";
}

/**
 * Tenant scope for vendor API calls comes from the admin session (`attachProjectRef`
 * uses `req.user.project_ref` when the URL does not include a project ref).
 * A static `x-project-ref` tied to `NEXT_PUBLIC_PROJECT_REF` breaks superadmin
 * workspace reassignment and multi-tenant local dev.
 */
export const api = createApiClient(resolveVendorApiBaseUrl());

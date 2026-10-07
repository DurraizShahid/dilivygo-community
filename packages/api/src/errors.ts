/**
 * Thin helpers around the error objects `createApiClient` throws.
 * Every thrown error from the shared client has shape:
 *   { message, statusCode?: number, body?: { error?, code?, ... } }
 */

export interface ApiErrorLike {
  statusCode?: number;
  body?: { code?: string; error?: string; message?: string } | null;
}

/** True when `err` is a `403 { code: "WORKSPACE_SUBSCRIPTION_REQUIRED" }` from the subscription gate. */
export function isWorkspaceSubscriptionRequiredError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as ApiErrorLike;
  return e.statusCode === 403 && e.body?.code === "WORKSPACE_SUBSCRIPTION_REQUIRED";
}


/** Best-effort extract of a backend-provided `code` string from a client error. */
export function getApiErrorCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as ApiErrorLike;
  return typeof e.body?.code === "string" ? e.body.code : null;
}

/** Best-effort extract of a backend-provided status code. */
export function getApiErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as ApiErrorLike;
  return typeof e.statusCode === "number" ? e.statusCode : null;
}

/**
 * Extract a human-readable error message from anything the SaaS/vendor/POS
 * dashboards routinely catch: shared-client errors with `body.error`, plain
 * `Error` instances, or arbitrary thrown values.
 *
 * Centralising this stops every toast from re-implementing the same
 * `err?.body?.error || err?.message || "…"` dance — and more importantly lets
 * us lint against `err: any` in the apps.
 */
export function getApiErrorMessage(
  err: unknown,
  fallback = "Something went wrong",
): string {
  if (!err) return fallback;
  if (typeof err === "string") return err || fallback;
  if (typeof err !== "object") return fallback;
  const e = err as ApiErrorLike & { message?: unknown };
  if (e.body && typeof e.body === "object") {
    if (typeof e.body.error === "string" && e.body.error.trim()) {
      return e.body.error;
    }
    if (typeof e.body.message === "string" && e.body.message.trim()) {
      return e.body.message;
    }
  }
  if (typeof e.message === "string" && e.message.trim()) {
    return e.message;
  }
  return fallback;
}

/**
 * Codes returned by the backend host-scope guard (`apps/server/lib/host-scope.js`)
 * when a staff user tries to authenticate or carry a session onto a host that
 * does not belong to their workspace / organization.
 */
export const TENANT_HOST_ERROR_CODES = [
  "WRONG_ORG_HOST",
  "WRONG_WORKSPACE_HOST",
  "TENANT_HOST_DRIFTED",
] as const;

export type TenantHostErrorCode = (typeof TENANT_HOST_ERROR_CODES)[number];

/**
 * True when `err` is a 403 from the host-scope guard. UI should show a clear
 * “sign in from your own brand’s URL” message instead of the generic invalid
 * credentials copy.
 */
export function isTenantHostMismatchError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as ApiErrorLike;
  if (e.statusCode !== 403) return false;
  const code = e.body?.code;
  return (
    typeof code === "string" &&
    (TENANT_HOST_ERROR_CODES as readonly string[]).includes(code)
  );
}

/**
 * Best-effort extract of the tenant-host error code (or `null` when the error
 * is unrelated). Useful when the UI wants to vary copy per code.
 */
export function getTenantHostErrorCode(err: unknown): TenantHostErrorCode | null {
  if (!isTenantHostMismatchError(err)) return null;
  const e = err as ApiErrorLike;
  return (e.body?.code as TenantHostErrorCode) ?? null;
}

/**
 * Map a tenant-host error to its `common:auth.tenantMismatch.*` i18next key.
 * Returns `null` when the error is not a tenant-host mismatch — caller should
 * fall through to its existing error handling.
 *
 * The returned key is namespace-prefixed (`common:…`) so callers can pass it
 * straight to `t(...)` regardless of which namespace they bound via
 * `useTranslation`.
 */
export function tenantHostErrorTranslationKey(
  err: unknown,
): string | null {
  const code = getTenantHostErrorCode(err);
  if (!code) return null;
  switch (code) {
    case "WRONG_ORG_HOST":
      return "common:auth.tenantMismatch.wrongOrg";
    case "WRONG_WORKSPACE_HOST":
      return "common:auth.tenantMismatch.wrongWorkspace";
    case "TENANT_HOST_DRIFTED":
      return "common:auth.tenantMismatch.hostDrifted";
    default:
      return "common:auth.tenantMismatch.generic";
  }
}

/**
 * Plain-English fallback message for environments without i18n (mobile apps
 * that still use raw strings, alerts, etc.). Use this when there is no
 * `t()` available to resolve the key from
 * `tenantHostErrorTranslationKey`.
 */
export function tenantHostErrorFallbackMessage(err: unknown): string | null {
  const code = getTenantHostErrorCode(err);
  if (!code) return null;
  switch (code) {
    case "WRONG_ORG_HOST":
      return "This account belongs to a different organization. Sign in from your organization's URL.";
    case "WRONG_WORKSPACE_HOST":
      return "This account is not authorized for this brand. Sign in from your brand's URL.";
    case "TENANT_HOST_DRIFTED":
      return "Two-factor verification must be completed on the same site you started signing in on. Please start over.";
    default:
      return "You can't sign in here. Please use the URL provided by your organization.";
  }
}

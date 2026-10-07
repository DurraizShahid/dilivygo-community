/**
 * Default public ref for browse + OTP when URL/pathname don't carry one.
 *
 * Post-organization-as-marketplace migration (see
 * `.cursor/rules/dilivygo-standards.mdc` → "Organization-as-marketplace") this ref
 * can be:
 *   - an **organization** `public_ref` (each org is its own independent marketplace —
 *     the usual value for a deployed customer app), OR
 *   - a workspace `project_ref` (legacy / dev), OR
 *   - the `_marketplace` sentinel, which resolves server-side to the synthetic
 *     marketplace organization (legacy fallback).
 *
 * `defaultWorkspaceRef()` prefers the **runtime-resolved** ref from the current
 * host (set by the SaaS host middleware in `packages/saas-host`) and only falls
 * back to build-time env when that isn't available (SSR without headers, tests).
 * This is critical for multi-tenancy: a single Vercel build serves every
 * `*.customer.dilivygo.com` subdomain, so build-time env cannot identify the
 * current tenant.
 */
import { getResolvedProjectRef } from "@/lib/resolved-project-ref";

const BUILD_TIME_FALLBACK =
  process.env.NEXT_PUBLIC_PROJECT_REF?.trim() || "_marketplace";

/**
 * Validates a ref for use in URLs / OTP (alphanumeric, dot, hyphen, underscore).
 */
export function sanitizeWorkspaceRef(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (!/^[\w.-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Ref from `/restaurant/[ref]/...` pathname segment. */
export function workspaceRefFromPathname(pathname: string): string | null {
  const m = pathname.match(/^\/restaurant\/([^/]+)/);
  if (!m?.[1]) return null;
  try {
    return sanitizeWorkspaceRef(decodeURIComponent(m[1]));
  } catch {
    return sanitizeWorkspaceRef(m[1]);
  }
}

/**
 * Login URL that scopes OTP to the storefront ref (organization public_ref or
 * legacy workspace project_ref). When the provided ref matches the current
 * tenant's resolved ref the query param is omitted for a cleaner URL.
 */
export function loginPathWithWorkspaceRef(ref: string | null | undefined): string {
  const safe = sanitizeWorkspaceRef(ref);
  const currentTenant = getResolvedProjectRef();
  if (!safe || safe === currentTenant || safe === BUILD_TIME_FALLBACK) {
    return "/login";
  }
  return `/login?ref=${encodeURIComponent(safe)}`;
}

/**
 * Current tenant's public ref. Resolves from (in order):
 *   1. The provider-set value populated by the server layout from
 *      `x-dilivygo-project-ref` (the SaaS host middleware's resolved value).
 *   2. The browser hostname (`{slug}.customer.{apex}`) as a last-resort client
 *      fallback.
 *   3. Build-time `NEXT_PUBLIC_PROJECT_REF` or `_marketplace` sentinel.
 */
export function defaultWorkspaceRef(): string {
  return getResolvedProjectRef() || BUILD_TIME_FALLBACK;
}

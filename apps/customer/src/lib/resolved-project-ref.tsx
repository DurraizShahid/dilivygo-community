"use client";

/**
 * Runtime-resolved public `ref` (organization `public_ref` for this tenant host).
 *
 * Why this exists:
 *   The customer app is a **single build** deployed to Vercel and served from
 *   every `*.customer.dilivygo.com` subdomain. A build-time env var like
 *   `NEXT_PUBLIC_PROJECT_REF` cannot identify the current tenant because the
 *   same bundle serves every org. The SaaS host middleware
 *   (`packages/saas-host/next-middleware.ts`) already resolves `host` →
 *   `organization.public_ref` and sets the `x-dilivygo-project-ref` header on
 *   every request. This module plumbs that value from the root server layout
 *   into client components so they can scope every public API call correctly.
 *
 * Failure mode we are fixing:
 *   Without this, `page.tsx` fell back to `_marketplace`, which resolves
 *   server-side to the synthetic marketplace organization and aggregates shops
 *   from **every** org in the deployment → a hard multi-tenancy leak.
 */

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from "react";

const BUILD_TIME_FALLBACK_REF =
  process.env.NEXT_PUBLIC_PROJECT_REF?.trim() || "_marketplace";

/**
 * Module-level ref updated by the provider so non-hook consumers
 * (e.g. the Zustand cart store, fire-and-forget fetchers) can synchronously
 * read the resolved ref without having to subscribe to the React tree.
 * Use `.current` mutation (not `let` reassignment) so render stays valid for
 * react-hooks/rules-of-react.
 */
const RESOLVED_REF_CACHE: { current: string } = {
  current: BUILD_TIME_FALLBACK_REF,
};

function sanitizeRefLiteral(input: string | null | undefined): string | null {
  const trimmed = input?.trim();
  if (!trimmed || trimmed.length > 128) return null;
  if (!/^[\w.-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Derive the tenant slug from `window.location.hostname` as a last-resort
 * fallback if the middleware header somehow didn't make it through (e.g. a
 * client-only navigation during a transient outage of `/api/public/resolve-host`).
 * Matches `{slug}.customer.{apex}` where apex is any DNS suffix.
 */
function slugFromHostname(hostname: string | null | undefined): string | null {
  if (!hostname) return null;
  const h = hostname.split(":")[0].trim().toLowerCase();
  const parts = h.split(".");
  if (parts.length < 3) return null;
  if (parts[1] !== "customer") return null;
  const slug = parts[0];
  if (!slug || slug === "www") return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}

const Ctx = createContext<string>(BUILD_TIME_FALLBACK_REF);

/**
 * Provider. Accepts the server-resolved ref (from `x-dilivygo-project-ref` in
 * the root layout) and keeps the module-level cache in sync for non-React
 * consumers.
 */
export function ResolvedProjectRefProvider({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const resolved = useMemo(() => {
    const sanitized = sanitizeRefLiteral(value);
    if (sanitized && sanitized !== BUILD_TIME_FALLBACK_REF) return sanitized;

    if (typeof window !== "undefined") {
      const derived = slugFromHostname(window.location.hostname);
      if (derived) return derived;
    }

    return sanitized || BUILD_TIME_FALLBACK_REF;
  }, [value]);

  useLayoutEffect(() => {
    RESOLVED_REF_CACHE.current = resolved;
  }, [resolved]);

  return <Ctx.Provider value={resolved}>{children}</Ctx.Provider>;
}

/** React hook for client components. Always returns a usable ref. */
export function useResolvedProjectRef(): string {
  return useContext(Ctx);
}

/**
 * Synchronous, non-React getter for the Zustand cart store and any module
 * that can't call a hook. Prefers the provider-set value; falls back to
 * hostname-derived slug (client only); falls back to the build-time env.
 *
 * Never throws. Never returns empty string.
 */
export function getResolvedProjectRef(): string {
  const c = RESOLVED_REF_CACHE.current;
  if (c && c !== BUILD_TIME_FALLBACK_REF) {
    return c;
  }
  if (typeof window !== "undefined") {
    const derived = slugFromHostname(window.location.hostname);
    if (derived) {
      RESOLVED_REF_CACHE.current = derived;
      return derived;
    }
  }
  return RESOLVED_REF_CACHE.current || BUILD_TIME_FALLBACK_REF;
}

/**
 * Array form for `NEXT_PUBLIC_RESTAURANT_REFS` compatibility. Most callers
 * just want `[useResolvedProjectRef()]` — the comma-separated env override is
 * only honored in dev / mobile and intentionally ignored in production because
 * the resolved tenant ref MUST be the authoritative scope.
 *
 * Community Edition: this single-ref scoping is the multi-vendor gate. The
 * customer app never aggregates across restaurants in CE; multi-vendor
 * aggregation is commercial Marketplace-suite behavior (see
 * `apps/customer-mobile/src/lib/public-shop-refs.ts` for the mobile gate).
 */
export function useResolvedProjectRefList(): string[] {
  const ref = useResolvedProjectRef();
  return useMemo(() => [ref], [ref]);
}

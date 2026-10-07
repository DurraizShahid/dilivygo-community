import { NextResponse, type NextRequest } from "next/server";

export type DilivygoSaasHostMiddlewareOptions = {
  /** Build-time default backend origin when host cannot be resolved. */
  apiUrl: string;
  /** Which Dilivygo web shell is running (matches `SAAS_DNS_APEX` pattern). */
  appSurface: "customer" | "vendor" | "rider" | "superadmin" | "pos";
  /** Build-time default ref when host does not resolve (e.g. NEXT_PUBLIC_PROJECT_REF). */
  envProjectRef: string;
  /**
   * Fail closed: when the host does not resolve to a known tenant, serve the
   * shell with `x-dilivygo-tenant-status: unknown` and no ref, so the app can
   * render an unavailable page instead of silently serving a default tenant.
   *
   * Defaults to `(customer || rider || vendor || pos) && NODE_ENV ===
   * "production"` — the tenant-facing shells must never leak a default tenant
   * onto an unknown host. Staff shells (vendor/pos) resolve a single workspace
   * (see `workspace_hostnames` + `{projectRef}.{surface}.{apex}`), so an
   * unclaimed vendor/pos host must fail closed rather than serve a default
   * workspace. Platform shells (`superadmin`) never fail closed — they are a
   * single platform host with no tenant binding.
   */
  failClosed?: boolean;
};

export type DilivygoTenantStatus = "ok" | "unknown" | "fallback";

/** Set on every proxied request; read via `headers()` in the root layout. */
export const TENANT_STATUS_HEADER = "x-dilivygo-tenant-status";
/** Resolved tenant ref (org public_ref on customer/rider, project_ref on staff). */
export const TENANT_PROJECT_REF_HEADER = "x-dilivygo-project-ref";
/** Surrogate canonical host for SEO (primary custom domain, else `{ref}.{surface}.{apex}`). */
export const TENANT_CANONICAL_HOST_HEADER = "x-dilivygo-canonical-host";

type ResolveHostPayload = {
  projectRef?: string | null;
  found?: boolean;
  canonicalHost?: string | null;
};

function extractHostname(host: string): string {
  const h = host.trim().toLowerCase();
  if (!h) return "";
  if (h.startsWith("[")) {
    const end = h.indexOf("]");
    return end > 1 ? h.slice(1, end) : h;
  }
  return h.split(":")[0];
}

/**
 * Hosts that are never tenant-resolved and must not fail closed:
 * local dev hosts plus Vercel preview hosts (`*.vercel.app`, `*.vercel.sh`,
 * `*.localhost`) that exist under `NODE_ENV=production` builds.
 */
function isDevLikeHost(host: string): boolean {
  const h = extractHostname(host);
  if (!h) return false;
  const staticDev = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  if (staticDev.has(h)) return true;
  return (
    h.endsWith(".lvh.me") ||
    h.endsWith(".vercel.app") ||
    h.endsWith(".vercel.sh") ||
    h.endsWith(".localhost")
  );
}

/**
 * Resolves the request host against the API's `/api/public/resolve-host`
 * endpoint and stamps the following headers for the shell's root layout:
 *
 *   - `x-dilivygo-project-ref`      tenant ref (org public_ref on
 *                                    customer/rider, project_ref on staff)
 *   - `x-dilivygo-tenant-status`     `ok` | `unknown` | `fallback`
 *   - `x-dilivygo-canonical-host`    surrogate canonical host for SEO, when known
 *
 * Dev-like hosts (localhost, *.lvh.me, *.vercel.app, ...) short-circuit to
 * `fallback` with the build-time `envProjectRef`, so local + preview builds
 * keep working without a resolvable apex.
 *
 * Unknown hosts while `failClosed` is on produce `unknown` with an empty ref —
 * the app is expected to render its unavailable/not-found surface rather than
 * leak a default tenant. When `failClosed` is off, unknown hosts produce
 * `fallback` with the build-time ref (legacy behavior).
 */
export function createDilivygoSaasMiddleware(opts: DilivygoSaasHostMiddlewareOptions) {
  const base = (opts.apiUrl || "").replace(/\/$/, "");
  const envRef = (opts.envProjectRef || "").trim() || "";
  const fallback = envRef || "_marketplace";
  const failClosed =
    opts.appSurface === "superadmin"
      ? false
      : opts.failClosed ??
        ((opts.appSurface === "customer" ||
          opts.appSurface === "rider" ||
          opts.appSurface === "vendor" ||
          opts.appSurface === "pos") &&
          process.env.NODE_ENV === "production");

  return async function middleware(request: NextRequest) {
    const requestHeaders = new Headers(request.headers);
    const rawHost = request.headers.get("host") || "";
    const host = extractHostname(rawHost);

    // Dev / preview hosts: never fail closed, never query.
    if (!host || isDevLikeHost(rawHost)) {
      requestHeaders.set(TENANT_STATUS_HEADER, "fallback");
      requestHeaders.set(TENANT_PROJECT_REF_HEADER, fallback);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    let found = false;
    let projectRef = fallback;
    let canonicalHost: string | null = null;

    if (base) {
      try {
        const u = new URL("/api/public/resolve-host", base);
        u.searchParams.set("host", host);
        u.searchParams.set("surface", opts.appSurface);
        const res = await fetch(u.toString(), { cache: "no-store" });
        if (res.ok) {
          const j = (await res.json()) as ResolveHostPayload;
          found = j?.found === true;
          canonicalHost = j?.canonicalHost ? String(j.canonicalHost).trim() : null;
          const ref = j?.projectRef ? String(j.projectRef).trim() : "";
          if (ref) projectRef = ref;
        }
      } catch {
        /* keep fallback */
      }
    }

    if (failClosed && !found) {
      requestHeaders.set(TENANT_STATUS_HEADER, "unknown");
      requestHeaders.set(TENANT_PROJECT_REF_HEADER, "");
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    requestHeaders.set(TENANT_STATUS_HEADER, found ? "ok" : "fallback");
    requestHeaders.set(TENANT_PROJECT_REF_HEADER, projectRef);
    if (canonicalHost) {
      requestHeaders.set(TENANT_CANONICAL_HOST_HEADER, canonicalHost);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  };
}
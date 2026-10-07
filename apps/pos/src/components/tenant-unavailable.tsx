import { Globe } from "lucide-react";

/**
 * Rendered by the root layout when the SaaS host middleware could not resolve
 * the request host to a known tenant (`x-dilivygo-tenant-status: unknown`).
 *
 * Fail-closed surface: no tenant queries, no API calls, no theme fetching —
 * just a plain OS-ish block so an unclaimed/unknown custom domain never leaks
 * a default tenant's branding or data.
 */
export function TenantUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="mx-auto w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Globe className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          This page is not available
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The address you visited is not connected to a Dilivygo POS. Contact
          your organization to get the correct link.
        </p>
      </div>
    </main>
  );
}
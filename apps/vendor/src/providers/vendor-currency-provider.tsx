"use client";

import { useQuery } from "@tanstack/react-query";
import { CurrencyContext } from "@dilivygo/ui";
import { useAuthStore } from "@/stores/auth-store";
import { staffProjectRef, useWorkspaceStore } from "@/stores/workspace-store";

/**
 * Vendor-side override of the `CurrencyContext` set by the root
 * `DynamicThemeProvider`. The root provider derives its currency from the
 * theme resolved via the `x-dilivygo-project-ref` host header, which can
 * degrade to the platform `_marketplace` fallback (→ `GBP`) whenever the
 * middleware can't map the host to a workspace — common in local dev and on
 * preview deployments. Chart tooltips and price labels then show `£`
 * everywhere regardless of what the org actually configured.
 *
 * We resolve the currency authoritatively from the signed-in staff member's
 * workspace `project_ref` instead:
 *
 *   1. `workspace.currency` if the workspace row already exposes it.
 *   2. `GET /api/public/theme?app=vendor_web&ref=<projectRef>` — same path the
 *      customer web uses; honours `platform_settings.get('default_currency',
 *      { projectRef })`.
 *
 * If neither source resolves, we leave the outer context untouched.
 */

async function fetchThemeCurrency(projectRef: string): Promise<string | null> {
  const qs = new URLSearchParams({ app: "vendor_web", ref: projectRef });
  const res = await fetch(`/api/public/theme?${qs}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { currencyCode?: string | null };
  const raw =
    typeof body.currencyCode === "string" ? body.currencyCode.trim() : "";
  return raw ? raw.toUpperCase() : null;
}

export function VendorCurrencyProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const projectRef = staffProjectRef(user) ?? workspace?.projectRef ?? null;

  const workspaceCurrency =
    typeof workspace?.currency === "string" && workspace.currency.trim()
      ? workspace.currency.trim().toUpperCase()
      : null;

  const { data: themeCurrency } = useQuery<string | null>({
    queryKey: ["vendor-theme-currency", projectRef],
    enabled: !!projectRef && !workspaceCurrency,
    staleTime: 120_000,
    queryFn: () => fetchThemeCurrency(projectRef as string),
  });

  const currencyCode = workspaceCurrency || themeCurrency || null;

  if (!currencyCode) {
    return <>{children}</>;
  }

  return (
    <CurrencyContext.Provider value={currencyCode}>
      {children}
    </CurrencyContext.Provider>
  );
}

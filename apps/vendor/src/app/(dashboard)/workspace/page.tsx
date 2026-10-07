"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AnimatedTbody, Badge, Skeleton, buttonVariants, cn } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { staffProjectRef, useWorkspaceStore } from "@/stores/workspace-store";

export default function VendorWorkspacePage() {
  const { t } = useTranslation("vendor");
  const user = useAuthStore((s) => s.user);
  const projectRef = staffProjectRef(user);
  const storeWorkspace = useWorkspaceStore((s) => s.workspace);

  const { data: workspacePayload, isLoading: wsLoading } = useQuery({
    queryKey: ["workspace", projectRef],
    queryFn: async () => {
      if (!projectRef) return null;
      return api.workspace.get(projectRef);
    },
    enabled: !!projectRef,
  });

  const workspace = workspacePayload?.workspace ?? storeWorkspace;

  const { data: shopsPayload, isLoading: shopsLoading } = useQuery({
    queryKey: ["shops", "vendor-workspace", projectRef],
    queryFn: () => api.shops.list({ includeInactive: true }),
    enabled: !!projectRef,
  });

  const shops = shopsPayload?.shops ?? [];

  return (
    <div className="space-y-8 text-foreground">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("workspacePage.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("workspacePage.subtitle")}</p>
      </header>

      <section className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6">
        <h2 className="text-sm font-semibold tracking-tight">{t("workspacePage.brandTitle")}</h2>
        {!projectRef ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("workspacePage.noProject")}</p>
        ) : wsLoading && !workspace ? (
          <Skeleton className="mt-4 h-40 w-full rounded-xl bg-muted" />
        ) : workspace ? (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("workspacePage.name")}
              </dt>
              <dd className="mt-1 text-lg font-semibold">{workspace.name}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("workspacePage.projectRef")}
              </dt>
              <dd className="mt-1 font-mono text-sm text-muted-foreground">{workspace.projectRef}</dd>
            </div>
            {workspace.description ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t("workspacePage.description")}
                </dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {workspace.description}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("workspacePage.phone")}
              </dt>
              <dd className="mt-1 text-sm">{workspace.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("workspacePage.currency")}
              </dt>
              <dd className="mt-1 text-sm tabular-nums">{workspace.currency || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("workspacePage.address")}
              </dt>
              <dd className="mt-1 text-sm text-muted-foreground">{workspace.address || "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Link
                href="/settings"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl")}
              >
                {t("workspacePage.editSettings")}
              </Link>
              <Link href="/shops" className={cn(buttonVariants({ size: "sm" }), "rounded-xl")}>
                {t("workspacePage.manageShops")}
              </Link>
            </div>
          </dl>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t("workspacePage.loadError")}</p>
        )}
      </section>

      <section className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">{t("workspacePage.shopsTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("workspacePage.shopsHint")}</p>
          </div>
          <Link href="/shops" className={cn(buttonVariants({ size: "sm" }), "w-fit rounded-xl")}>
            {t("workspacePage.openShops")}
          </Link>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("workspacePage.colShop")}</th>
                <th className="px-4 py-3 font-medium">{t("workspacePage.colSlug")}</th>
                <th className="px-4 py-3 font-medium">{t("workspacePage.colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("workspacePage.colAddress")}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <AnimatedTbody>
              {!projectRef ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {t("workspacePage.noProject")}
                  </td>
                </tr>
              ) : shopsLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <Skeleton className="h-32 w-full bg-muted" />
                  </td>
                </tr>
              ) : shops.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    {t("workspacePage.noShops")}
                  </td>
                </tr>
              ) : (
                shops.map((shop) => (
                  <tr key={shop.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium">{shop.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{shop.slug}</td>
                    <td className="px-4 py-3">
                      <Badge variant={shop.isActive ? "default" : "secondary"} className="rounded-full text-[10px]">
                        {shop.isActive ? t("workspacePage.active") : t("workspacePage.inactive")}
                      </Badge>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-muted-foreground">
                      {shop.address || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href="/shops"
                        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-lg")}
                      >
                        {t("workspacePage.view")}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </AnimatedTbody>
          </table>
        </div>
      </section>
    </div>
  );
}

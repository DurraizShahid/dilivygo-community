"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { AnimatedTbody, Skeleton, formatPrice, useCurrency } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";
import type { AnalyticsRangeDays } from "@dilivygo/types";
import { RangeSelector } from "@/components/vendor-dashboard-charts";

function humanizeStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function VendorAnalyticsPage() {
  const { t } = useTranslation("vendor");
  const contextCurrency = useCurrency();
  const activeShop = useShopStore((s) => s.activeShop);
  const [rangeDays, setRangeDays] = useState<AnalyticsRangeDays>(30);

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-analytics", rangeDays, activeShop?.id ?? "all-shops"],
    queryFn: () => api.orders.analytics({ rangeDays, shopId: activeShop?.id }),
  });

  const currency = data?.currencyCode || contextCurrency;

  const s = data?.summary;
  const series = data?.series;

  const peakRows = useMemo(() => series?.peakHours ?? [], [series]);
  const dayRows = useMemo(() => series?.ordersByDay ?? [], [series]);
  const popularRows = useMemo(() => series?.popularItems ?? [], [series]);
  const statusRows = useMemo(() => series?.statusBreakdown ?? [], [series]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 text-foreground"
    >
      <motion.header variants={itemVariants} className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t("analyticsPage.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("analyticsPage.subtitle")}</p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <span className="text-xs font-medium text-muted-foreground">{t("dashboard.rangeLabel")}</span>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <RangeSelector value={rangeDays} onChange={setRangeDays} />
          </motion.div>
        </div>
      </motion.header>

      <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6 transition-shadow hover:shadow-md">
        <h2 className="text-sm font-semibold tracking-tight">{t("analyticsPage.summaryTitle")}</h2>
        {isLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: t("dashboard.orders"), value: s?.totalOrders ?? 0 },
              { label: t("analyticsPage.revenue"), value: formatPrice(s?.totalRevenueCents ?? 0, currency) },
              { label: t("analyticsPage.avgOrderValue"), value: formatPrice(s?.averageOrderValueCents ?? 0, currency) },
              { label: t("analyticsPage.completionRate"), value: `${s?.completionRate ?? 0}%` },
              { label: t("analyticsPage.avgPrep"), value: `${s?.averagePrepMinutes ?? 0} ${t("analyticsPage.min")}` },
              {
                label: t("analyticsPage.orderTrend"),
                value: `${(s?.orderTrendPct ?? 0) >= 0 ? "+" : ""}${(s?.orderTrendPct ?? 0).toFixed(1)}%`,
              },
              {
                label: t("analyticsPage.revenueTrend"),
                value: `${(s?.revenueTrendPct ?? 0) >= 0 ? "+" : ""}${(s?.revenueTrendPct ?? 0).toFixed(1)}%`,
              },
              { label: t("analyticsPage.completedOrders"), value: s?.completedOrders ?? 0 },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
              >
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </dt>
                <dd className="text-2xl font-bold tabular-nums">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={String(stat.value)}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      transition={{ duration: 0.15 }}
                    >
                      {stat.value}
                    </motion.span>
                  </AnimatePresence>
                </dd>
              </motion.div>
            ))}
          </dl>
        )}
      </motion.section>

      <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6 transition-shadow hover:shadow-md">
        <h2 className="text-sm font-semibold tracking-tight">{t("analyticsPage.dailyTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("analyticsPage.dailyHint")}</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("analyticsPage.colDate")}</th>
                <th className="px-4 py-3 font-medium">{t("analyticsPage.colOrders")}</th>
                <th className="px-4 py-3 font-medium">{t("analyticsPage.colRevenue")}</th>
                <th className="px-4 py-3 font-medium">{t("analyticsPage.colCompleted")}</th>
              </tr>
            </thead>
            <AnimatedTbody>
              {isLoading ? (
                <tr key="loading">
                  <td colSpan={4} className="px-4 py-8">
                    <Skeleton className="h-32 w-full bg-muted" />
                  </td>
                </tr>
              ) : dayRows.length === 0 ? (
                <tr key="empty">
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    {t("analyticsPage.emptySeries")}
                  </td>
                </tr>
              ) : (
                dayRows.map((row) => (
                  <tr key={row.date} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-medium tabular-nums">{row.date}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.orders ?? 0}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {formatPrice(row.revenueCents ?? 0, currency)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{row.completed ?? 0}</td>
                  </tr>
                ))
              )}
            </AnimatedTbody>
          </table>
        </div>
      </motion.section>

      <motion.div variants={itemVariants} className="grid gap-4 lg:grid-cols-2">
        <section className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6 transition-shadow hover:shadow-md">
          <h2 className="text-sm font-semibold tracking-tight">{t("analyticsPage.peakTitle")}</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[280px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("analyticsPage.colHour")}</th>
                  <th className="px-4 py-3 font-medium">{t("analyticsPage.colOrders")}</th>
                </tr>
              </thead>
              <AnimatedTbody>
                {isLoading ? (
                  <tr key="loading">
                    <td colSpan={2} className="px-4 py-6">
                      <Skeleton className="h-24 w-full bg-muted" />
                    </td>
                  </tr>
                ) : peakRows.length === 0 ? (
                  <tr key="empty">
                    <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                      {t("analyticsPage.emptyPeak")}
                    </td>
                  </tr>
                ) : (
                  peakRows.map((row) => (
                    <tr key={String(row.hour)} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-2.5">{row.hour}</td>
                      <td className="px-4 py-2.5 tabular-nums">{row.orders ?? 0}</td>
                    </tr>
                  ))
                )}
              </AnimatedTbody>
            </table>
          </div>
        </section>

        <section className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6 transition-shadow hover:shadow-md">
          <h2 className="text-sm font-semibold tracking-tight">{t("analyticsPage.statusTitle")}</h2>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[280px] text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("analyticsPage.colStatus")}</th>
                  <th className="px-4 py-3 font-medium">{t("analyticsPage.colCount")}</th>
                </tr>
              </thead>
              <AnimatedTbody>
                {isLoading ? (
                  <tr key="loading">
                    <td colSpan={2} className="px-4 py-6">
                      <Skeleton className="h-24 w-full bg-muted" />
                    </td>
                  </tr>
                ) : statusRows.length === 0 ? (
                  <tr key="empty">
                    <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                      {t("analyticsPage.emptyStatus")}
                    </td>
                  </tr>
                ) : (
                  statusRows.map((row) => (
                    <tr key={row.status} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                      <td className="px-4 py-2.5">{humanizeStatus(row.status)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{row.count}</td>
                    </tr>
                  ))
                )}
              </AnimatedTbody>
            </table>
          </div>
        </section>
      </motion.div>

      <motion.section variants={itemVariants} className="dashboard-glass-panel rounded-[24px] p-5 sm:p-6 transition-shadow hover:shadow-md">
        <h2 className="text-sm font-semibold tracking-tight">{t("analyticsPage.popularTitle")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t("analyticsPage.popularHint")}</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("analyticsPage.colItem")}</th>
                <th className="px-4 py-3 font-medium">{t("analyticsPage.colQuantity")}</th>
                <th className="px-4 py-3 font-medium">{t("analyticsPage.colRevenue")}</th>
              </tr>
            </thead>
            <AnimatedTbody>
              {isLoading ? (
                <tr key="loading">
                  <td colSpan={3} className="px-4 py-8">
                    <Skeleton className="h-32 w-full bg-muted" />
                  </td>
                </tr>
              ) : popularRows.length === 0 ? (
                <tr key="empty">
                  <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                    {t("analyticsPage.emptyPopular")}
                  </td>
                </tr>
              ) : (
                popularRows.map((row) => (
                  <tr key={row.name} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-medium">{row.name}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.quantity}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {formatPrice(row.revenueCents, currency)}
                    </td>
                  </tr>
                ))
              )}
            </AnimatedTbody>
          </table>
        </div>
      </motion.section>
    </motion.div>
  );
}

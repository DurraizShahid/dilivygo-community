"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertTriangle,
  Download,
  EyeOff,
  FileSpreadsheet,
  Filter,
  GripVertical,
  LayoutGrid,
  LineChart,
  Loader2,
  MapPin,
  MessageSquareQuote,
  RotateCcw,
  Star,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
  Skeleton,
  Switch,
  cn,
  formatPrice,
  useCurrency,
} from "@dilivygo/ui";
import { toast } from "sonner";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import {
  downloadVendorAnalyticsCsv,
  downloadVendorAnalyticsHtml,
} from "@/lib/vendor-analytics-export";
import { buildHeatMatrix, matrixStats } from "@/lib/dashboard-heat-matrix";
import { useShopStore } from "@/stores/shop-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useAuthStore } from "@/stores/auth-store";
import type { AnalyticsRangeDays } from "@dilivygo/types";
import { VendorPerformanceSnapshot, statusMapFromBreakdown } from "@/components/vendor-dashboard-kpi";
import {
  ChartCard,
  ChartLegend,
  PopularItemsBarChart,
  RangeSelector,
  StatBadge,
  StatusDonutChart,
  PEACH,
  CYAN,
  LIME,
  AMBER,
} from "@/components/vendor-dashboard-charts";
import {
  VisxDemandHeatmapResponsive,
  VisxNeonPeakBarsResponsive,
  VisxOrdersRevenueDualResponsive,
  VisxPulseAovResponsive,
  VisxScatterDemandResponsive,
} from "@/components/vendor-dashboard-visx-charts";

const CARD_IDS = [
  "kpi",
  "analyticsHero",
  "opsAlert",
  "ordersTrend",
  "demandDensity",
  "peakHours",
  "statusBreakdown",
  "revenueTrend",
  "popularItems",
  "reviews",
  "summaryStrip",
] as const;
type CardId = (typeof CARD_IDS)[number];
type CardSize = "small" | "medium" | "large";

const CARD_META: Record<CardId, { label: string; isChart: boolean }> = {
  kpi: { label: "Performance snapshot", isChart: false },
  analyticsHero: { label: "Demand landscape", isChart: true },
  opsAlert: { label: "Operations pulse", isChart: false },
  ordersTrend: { label: "Orders & revenue", isChart: true },
  demandDensity: { label: "Demand density", isChart: true },
  peakHours: { label: "Peak hours", isChart: true },
  statusBreakdown: { label: "Order status", isChart: true },
  revenueTrend: { label: "Avg. order value", isChart: true },
  popularItems: { label: "Menu leaderboard", isChart: true },
  reviews: { label: "Reviews pulse", isChart: false },
  summaryStrip: { label: "Summary metrics", isChart: false },
};

/** Grouped rows for the widget visibility dialog (labels via i18n `labelKey`). */
const WIDGET_PANEL_GROUPS: {
  groupTitleKey: string;
  items: { id: CardId; labelKey: string }[];
}[] = [
  {
    groupTitleKey: "dashboard.widgetGroupOverview",
    items: [
      { id: "kpi", labelKey: "dashboard.performanceSnapshot" },
      { id: "opsAlert", labelKey: "dashboard.widgetOpsPulse" },
      { id: "summaryStrip", labelKey: "dashboard.widgetSummaryMetrics" },
    ],
  },
  {
    groupTitleKey: "dashboard.widgetGroupCharts",
    items: [
      { id: "analyticsHero", labelKey: "dashboard.widgetDemandLandscape" },
      { id: "ordersTrend", labelKey: "dashboard.ordersRevenueTitle" },
      { id: "demandDensity", labelKey: "dashboard.demandDensityTitle" },
      { id: "peakHours", labelKey: "dashboard.peakHoursTitle" },
      { id: "statusBreakdown", labelKey: "dashboard.statusTitle" },
      { id: "revenueTrend", labelKey: "dashboard.aovTitle" },
      { id: "popularItems", labelKey: "dashboard.menuLeaderboardTitle" },
    ],
  },
  {
    groupTitleKey: "dashboard.widgetGroupEngagement",
    items: [{ id: "reviews", labelKey: "dashboard.reviewsPulse" }],
  },
];

const CHART_CARD_IDS = CARD_IDS.filter((id) => CARD_META[id].isChart);

const CARD_LABEL_KEY = Object.fromEntries(
  WIDGET_PANEL_GROUPS.flatMap((g) => g.items.map((it) => [it.id, it.labelKey] as const)),
) as Record<CardId, string>;

function reorder<T>(items: T[], from: number, to: number) {
  const clone = [...items];
  const [moved] = clone.splice(from, 1);
  clone.splice(to, 0, moved);
  return clone;
}

function defaultSizes(): Record<CardId, CardSize> {
  return {
    kpi: "large",
    analyticsHero: "large",
    opsAlert: "large",
    ordersTrend: "large",
    demandDensity: "medium",
    peakHours: "medium",
    statusBreakdown: "medium",
    revenueTrend: "medium",
    popularItems: "large",
    reviews: "medium",
    summaryStrip: "large",
  };
}

function readPrefs() {
  const defaults = {
    order: [...CARD_IDS] as CardId[],
    sizes: defaultSizes(),
    hidden: [] as CardId[],
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem("vendor-analytics-prefs");
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as {
      order?: string[];
      sizes?: Partial<Record<string, CardSize>>;
      hidden?: string[];
    };
    const validOrder = (parsed.order || []).filter((id): id is CardId =>
      CARD_IDS.includes(id as CardId),
    );
    const mergedOrder = [...validOrder];
    for (const id of CARD_IDS) {
      if (!mergedOrder.includes(id)) mergedOrder.push(id);
    }
    const mergedSizes = { ...defaultSizes() };
    for (const k of CARD_IDS) {
      const s = parsed.sizes?.[k];
      if (s === "small" || s === "medium" || s === "large") mergedSizes[k] = s;
    }
    const hidden = (parsed.hidden || []).filter((id): id is CardId =>
      CARD_IDS.includes(id as CardId),
    );
    return { order: mergedOrder, sizes: mergedSizes, hidden };
  } catch {
    return defaults;
  }
}

/** Minimum card shell; chart plot heights are fixed in visx wrappers to avoid grid row stretch. */
function heightClass(size: CardSize) {
  if (size === "small") return "min-h-[200px]";
  if (size === "large") return "min-h-[260px]";
  return "min-h-[220px]";
}

function spanClass(cardId: CardId, size: CardSize) {
  /** Performance snapshot holds four wide tiles — always full row so it never shares with charts. */
  if (cardId === "kpi") return "col-span-full lg:col-span-6";
  if (size === "small") return "lg:col-span-2";
  if (size === "large") return "lg:col-span-6";
  return "lg:col-span-3";
}

function csvValue(value: unknown): string {
  if (value == null) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function exportCsv<T extends object>(filename: string, rows: T[]) {
  if (!rows.length || typeof window === "undefined") return;
  const headers = Object.keys(rows[0]) as Array<keyof T>;
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function dashboardGreetingLine(
  user: { name?: string | null; email?: string | null } | null,
): string {
  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const display =
    user?.name?.trim() ||
    user?.email?.split("@")[0]?.replace(/[._]/g, " ") ||
    "there";
  const firstWord = display.split(/\s+/)[0] ?? display;
  const name =
    firstWord.toLowerCase() === "there"
      ? "there"
      : firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  return `${timeGreeting}, ${name}.`;
}

function formatReviewDate(value: string | undefined | null): string {
  if (value == null || value === "") return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return d.toLocaleDateString();
  } catch {
    return "—";
  }
}

export default function DashboardHomePage() {
  const { t } = useTranslation("vendor");
  const contextCurrency = useCurrency();
  const user = useAuthStore((s) => s.user);
  const greetingLine = useMemo(() => dashboardGreetingLine(user), [user]);
  const activeShop = useShopStore((s) => s.activeShop);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const [rangeDays, setRangeDays] = useState<AnalyticsRangeDays>(30);
  const [draggedCard, setDraggedCard] = useState<CardId | null>(null);
  const [prefs, setPrefs] = useState(readPrefs);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [widgetSettingsOpen, setWidgetSettingsOpen] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;

  const visibleWidgetCount = CARD_IDS.length - prefs.hidden.length;

  const springTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 380, damping: 34 };
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("vendor-analytics-prefs", JSON.stringify(prefs));
  }, [prefs]);

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-analytics", rangeDays, activeShop?.id ?? "all-shops"],
    queryFn: () => api.orders.analytics({ rangeDays, shopId: activeShop?.id }),
  });

  // The analytics response carries the workspace's org-scoped currency so
  // chart tooltips always match the revenueCents values they render, even
  // when the outer CurrencyContext hasn't hydrated (dev hosts without a
  // project-ref header fall back to the platform GBP default).
  const currency = data?.currencyCode || contextCurrency;
  const { data: reviewData, isLoading: reviewsLoading } = useQuery({
    queryKey: ["vendor-dashboard-reviews", activeShop?.id],
    queryFn: () => api.reviews.listShop({ shopId: activeShop!.id, limit: 3 }),
    enabled: !!activeShop?.id,
  });

  const visibleCards = useMemo(
    () => prefs.order.filter((cardId) => !prefs.hidden.includes(cardId)),
    [prefs.hidden, prefs.order],
  );

  const sm = useMemo(
    () => statusMapFromBreakdown(data?.series.statusBreakdown ?? []),
    [data],
  );

  const totalOrders = data?.summary.totalOrders ?? 0;
  const activeTracking =
    (sm.get("assigned") || 0) + (sm.get("picked_up") || 0) + (sm.get("arrived") || 0);
  const delivered = sm.get("completed") || 0;
  const pendingOps =
    (sm.get("placed") || 0) +
    (sm.get("accepted") || 0) +
    (sm.get("preparing") || 0) +
    (sm.get("ready") || 0);

  const orderTrend = data?.summary.orderTrendPct ?? 0;
  const revenueTrend = data?.summary.revenueTrendPct ?? 0;
  const activeTrend = 0;

  const rangeRevenueCents = data?.summary.totalRevenueCents ?? 0;
  const avgOrderValueCents = data?.summary.averageOrderValueCents ?? 0;

  const ordersByDay = data?.series.ordersByDay ?? [];
  const peakHours = data?.series.peakHours ?? [];
  const statusBreakdown = data?.series.statusBreakdown ?? [];

  const heatMatrix = useMemo(
    () => buildHeatMatrix(ordersByDay, peakHours),
    [ordersByDay, peakHours],
  );
  const heatStats = useMemo(() => matrixStats(heatMatrix), [heatMatrix]);

  const todayStr = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  function moveCard(overId: CardId) {
    if (!draggedCard || draggedCard === overId) return;
    const from = prefs.order.indexOf(draggedCard);
    const to = prefs.order.indexOf(overId);
    if (from === -1 || to === -1) return;
    setPrefs((prev) => ({ ...prev, order: reorder(prev.order, from, to) }));
    setDraggedCard(null);
  }

  function setCardSize(cardId: CardId, size: CardSize) {
    setPrefs((prev) => ({ ...prev, sizes: { ...prev.sizes, [cardId]: size } }));
  }

  function setCardVisible(cardId: CardId, visible: boolean) {
    setPrefs((prev) => ({
      ...prev,
      hidden: visible
        ? prev.hidden.filter((id) => id !== cardId)
        : prev.hidden.includes(cardId)
          ? prev.hidden
          : [...prev.hidden, cardId],
    }));
  }

  function exportCardCsv(cardId: CardId) {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (cardId === "ordersTrend" || cardId === "demandDensity") {
      exportCsv(`vendor-orders-series-${stamp}.csv`, data.series.ordersByDay as unknown as object[]);
    } else if (cardId === "peakHours" || cardId === "analyticsHero") {
      exportCsv(`vendor-peak-hours-${stamp}.csv`, data.series.peakHours as unknown as object[]);
    } else if (cardId === "statusBreakdown") {
      exportCsv(`vendor-status-breakdown-${stamp}.csv`, data.series.statusBreakdown as unknown as object[]);
    } else if (cardId === "popularItems") {
      exportCsv(`vendor-popular-items-${stamp}.csv`, data.series.popularItems as unknown as object[]);
    } else if (cardId === "revenueTrend") {
      exportCsv(`vendor-orders-series-${stamp}.csv`, data.series.ordersByDay as unknown as object[]);
    }
  }

  function downloadReport() {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    exportCsv(`vendor-orders-${stamp}.csv`, data.series.ordersByDay as unknown as Record<string, unknown>[]);
  }

  async function exportFullAnalytics(kind: "csv" | "html" | "both") {
    if (!data || isExportingReport) return;
    setIsExportingReport(true);
    try {
      let reviewsPayload: Awaited<ReturnType<typeof api.reviews.listShop>> | null = null;
      if (activeShop?.id) {
        reviewsPayload = await api.reviews.listShop({
          shopId: activeShop.id,
          limit: 200,
        });
      }
      const ctx = {
        analytics: data,
        currencyCode: currency,
        workspaceName: workspace?.name?.trim() || "Workspace",
        shopLabel: activeShop?.name?.trim() || "All shops",
        generatedAt: new Date(),
        reviews: reviewsPayload,
      };
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `dilivygo-vendor-analytics-${rangeDays}d-${stamp}`;
      if (kind === "csv" || kind === "both") {
        downloadVendorAnalyticsCsv(ctx, `${base}.csv`);
      }
      if (kind === "html" || kind === "both") {
        downloadVendorAnalyticsHtml(ctx, `${base}.html`);
      }
      if (kind === "both") {
        toast.success("Downloaded CSV data and HTML chart report");
      } else if (kind === "csv") {
        toast.success("Downloaded full CSV report");
      } else {
        toast.success("Downloaded visual HTML report");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExportingReport(false);
    }
  }

  function resetLayout() {
    setPrefs({
      order: [...CARD_IDS] as unknown as CardId[],
      sizes: defaultSizes(),
      hidden: [],
    });
  }

  function showAllWidgets() {
    setPrefs((prev) => ({ ...prev, hidden: [] }));
  }

  function hideAllChartWidgets() {
    setPrefs((prev) => ({
      ...prev,
      hidden: [...new Set([...prev.hidden, ...CHART_CARD_IDS])],
    }));
  }

  const content: Record<CardId, (size: CardSize) => ReactNode> = {
    kpi: () => (
      <VendorPerformanceSnapshot
        isLoading={isLoading}
        rangeDays={rangeDays}
        totalOrders={totalOrders}
        activeTracking={activeTracking}
        delivered={delivered}
        rangeRevenueCents={rangeRevenueCents}
        orderTrend={orderTrend}
        revenueTrend={revenueTrend}
        activeTrend={activeTrend}
        assignedCount={sm.get("assigned") || 0}
        pickedUpCount={sm.get("picked_up") || 0}
        arrivedCount={sm.get("arrived") || 0}
        ordersByDay={ordersByDay}
        currencyCode={currency}
      />
    ),
    analyticsHero: () => (
      <div className="grid items-stretch gap-4 xl:grid-cols-5">
        <ChartCard
          variant="transparent"
          className="h-[360px] min-h-0 sm:h-[400px] xl:col-span-3"
          title={t("dashboard.heroScatterTitle")}
          subtitle={t("dashboard.heroScatterSubtitle")}
        >
          {isLoading ? (
            <Skeleton className="min-h-0 flex-1 rounded-2xl bg-muted" />
          ) : (
            <VisxScatterDemandResponsive data={ordersByDay} fillParent />
          )}
        </ChartCard>
        <div className="flex h-[360px] min-h-0 flex-col sm:h-[400px] xl:col-span-2">
          <ChartCard
            variant="transparent"
            className="h-full min-h-0 shrink-0 p-3 pb-2.5 pt-3.5 sm:p-4 sm:pb-3 sm:pt-4"
            headerRowClassName="mb-1.5 items-center"
            title={t("dashboard.heroHeatTitle")}
            subtitle={t("dashboard.heroHeatSubtitle")}
            action={
              !isLoading ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                  <StatBadge label="Min" value={heatStats.min} color={PEACH} />
                  <StatBadge label="Avg" value={heatStats.avg} color={AMBER} />
                  <StatBadge label="Max" value={heatStats.max} color={LIME} />
                </div>
              ) : undefined
            }
          >
            {isLoading ? (
              <Skeleton className="min-h-0 flex-1 rounded-xl bg-muted" />
            ) : (
              <VisxDemandHeatmapResponsive ordersByDay={ordersByDay} peakHours={peakHours} />
            )}
          </ChartCard>
        </div>
      </div>
    ),
    opsAlert: () => (
      <div className="dashboard-glass-panel flex flex-col gap-4 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span
            className="flex size-10 items-center justify-center rounded-xl text-[#eb5e28] dark:text-[#C1DF1F]"
            style={{ background: `${PEACH}18` }}
          >
            <AlertTriangle className="size-5" />
          </span>
          <span>
            {t("dashboard.opsQueueLine")}{" "}
            <span className="font-semibold text-foreground">{pendingOps}</span>{" "}
            {t("dashboard.opsQueueRest")}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-xl bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={t("dashboard.filtersAria")}
          >
            <Filter className="size-[18px]" />
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-11 rounded-xl border-0 bg-muted text-foreground hover:bg-muted/80"
            onClick={downloadReport}
            disabled={!data}
          >
            {t("dashboard.downloadReport")}
          </Button>
          <Link
            href="/orders"
            className="inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition hover:opacity-95"
            style={{ background: PEACH, color: "#14100e" }}
          >
            {t("dashboard.viewOrders")}
          </Link>
        </div>
      </div>
    ),
    ordersTrend: () => (
      <ChartCard
        variant="transparent"
        title={t("dashboard.ordersRevenueTitle")}
        subtitle={t("dashboard.ordersRevenueSubtitle", { days: rangeDays })}
        action={<RangeSelector value={rangeDays} onChange={setRangeDays} />}
      >
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-2xl bg-muted" />
        ) : (
          <>
            <VisxOrdersRevenueDualResponsive data={ordersByDay} currency={currency} />
            <ChartLegend
              items={[
                { label: t("dashboard.legendOrders"), color: PEACH },
                { label: t("dashboard.legendRevenue"), color: CYAN },
              ]}
            />
          </>
        )}
      </ChartCard>
    ),
    demandDensity: (size) => (
      <ChartCard
        variant="transparent"
        className={cn("w-full min-h-0", heightClass(size))}
        title={t("dashboard.demandDensityTitle")}
        subtitle={t("dashboard.demandDensitySubtitle")}
      >
        {isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-2xl bg-muted" />
        ) : (
          <VisxScatterDemandResponsive data={ordersByDay} />
        )}
      </ChartCard>
    ),
    peakHours: (size) => (
      <ChartCard
        className={cn("w-full min-h-0", heightClass(size))}
        title={t("dashboard.peakHoursTitle")}
        subtitle={t("dashboard.peakHoursSubtitle")}
      >
        {isLoading ? (
          <Skeleton className="h-[200px] w-full rounded-2xl bg-muted" />
        ) : (
          <div className="flex flex-col gap-2">
            <VisxNeonPeakBarsResponsive data={peakHours} />
            <p className="text-[11px] text-muted-foreground">{t("dashboard.peakHoursHint")}</p>
          </div>
        )}
      </ChartCard>
    ),
    statusBreakdown: (size) => (
      <ChartCard
        className={cn("w-full min-h-0", heightClass(size))}
        title={t("dashboard.statusTitle")}
        subtitle={t("dashboard.statusSubtitle", { days: rangeDays })}
      >
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-2xl bg-muted" />
        ) : statusBreakdown.length === 0 ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            {t("dashboard.noOrderData")}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-2">
            <StatusDonutChart data={statusBreakdown} />
          </div>
        )}
      </ChartCard>
    ),
    revenueTrend: (size) => (
      <ChartCard
        variant="transparent"
        className={cn("w-full min-h-0", heightClass(size))}
        title={t("dashboard.aovTitle")}
        subtitle={t("dashboard.aovSubtitle")}
        action={
          <div
            className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground"
            style={{ color: CYAN }}
          >
            {isLoading ? "—" : formatPrice(avgOrderValueCents, currency)}
          </div>
        }
      >
        {isLoading ? (
          <Skeleton className="h-[220px] w-full rounded-2xl bg-muted" />
        ) : (
          <VisxPulseAovResponsive data={ordersByDay} currency={currency} />
        )}
      </ChartCard>
    ),
    popularItems: (size) => (
      <ChartCard
        variant="transparent"
        className={cn("w-full min-h-0", heightClass(size))}
        title={t("dashboard.menuLeaderboardTitle")}
        subtitle={t("dashboard.menuLeaderboardSubtitle")}
        action={
          <Link
            href="/menu"
            className="flex items-center gap-1 text-xs font-medium transition"
            style={{ color: PEACH }}
          >
            <TrendingUp className="size-3.5" />
            {t("dashboard.openMenu")}
          </Link>
        }
      >
        {isLoading ? (
          <Skeleton className="h-[200px] w-full rounded-2xl bg-muted" />
        ) : (data?.series.popularItems ?? []).length === 0 ? (
          <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">
            {t("dashboard.noOrderItems")}
          </div>
        ) : (
          <PopularItemsBarChart data={data!.series.popularItems} currency={currency} />
        )}
      </ChartCard>
    ),
    reviews: () => (
      <ChartCard title={t("dashboard.reviewsPulse")} subtitle={t("dashboard.reviewsSubtitle")}>
        {!activeShop ? (
          <div className="text-sm text-muted-foreground">{t("dashboard.selectShopForReviews")}</div>
        ) : reviewsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-36 bg-muted" />
            <Skeleton className="h-16 w-full bg-muted" />
            <Skeleton className="h-16 w-full bg-muted" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2">
              <div className="text-xs text-muted-foreground">{t("dashboard.averageRating")}</div>
              <div className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <Star className="size-4 fill-amber-400 text-amber-500" />
                <span>{(reviewData?.summary.averageRating ?? 0).toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">
                  ({reviewData?.summary.reviewCount ?? 0})
                </span>
              </div>
            </div>
            {(reviewData?.reviews ?? [])
              .filter((review) => review.comment)
              .slice(0, 3)
              .map((review) => (
                <div
                  key={review.id}
                  className="rounded-xl border border-border bg-muted/20 px-3 py-2"
                >
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <Star className="size-3.5 fill-current" />
                      {review.rating.toFixed(1)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatReviewDate(
                        review.createdAt ?? (review as { created_at?: string }).created_at,
                      )}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{review.comment}</p>
                </div>
              ))}
            {!((reviewData?.reviews ?? []).some((review) => !!review.comment)) && (
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <MessageSquareQuote className="size-4" />
                {t("dashboard.noWrittenComments")}
              </div>
            )}
          </div>
        )}
      </ChartCard>
    ),
    summaryStrip: () => (
      <div className="dashboard-glass-panel grid grid-cols-2 gap-6 rounded-[24px] p-5 sm:grid-cols-4 sm:gap-8">
        {[
          {
            label: t("dashboard.stripAov"),
            value: isLoading ? "—" : formatPrice(avgOrderValueCents, currency),
            color: CYAN,
          },
          {
            label: t("dashboard.stripDeliveredRate"),
            value:
              isLoading || totalOrders === 0
                ? "—"
                : `${Math.round((delivered / totalOrders) * 100)}%`,
            color: LIME,
          },
          {
            label: t("dashboard.stripInFlight"),
            value: isLoading ? "—" : String(activeTracking),
            color: AMBER,
          },
          {
            label: t("dashboard.stripPendingOps"),
            value: isLoading ? "—" : String(pendingOps),
            color: PEACH,
          },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
            <span className="text-2xl font-bold tabular-nums" style={{ color: s.color }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    ),
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-8 text-foreground">
        <Skeleton className="h-32 w-full max-w-xl rounded-2xl bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-[26px] bg-muted" />
          ))}
        </div>
        <Skeleton className="h-[360px] w-full rounded-[24px] bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-8 text-foreground">
      <section aria-label={t("dashboard.overviewAria")} className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium tracking-tight text-muted-foreground">{greetingLine}</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t("dashboard.commandTitle")}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" style={{ color: PEACH }} />
              {activeShop?.name?.trim() || workspace?.name?.trim() || t("dashboard.allShopsContext")}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>
              {t("dashboard.todayLabel", { date: todayStr })}
            </span>
          </div>
        </div>

        <div className="dashboard-glass-panel flex flex-col gap-3 rounded-[24px] p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("dashboard.rangeLabel")}
            </span>
            <RangeSelector value={rangeDays} onChange={setRangeDays} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!data || isExportingReport}
              size="sm"
              className="h-9 gap-2 rounded-xl font-semibold"
              style={{ background: PEACH, color: "#14100e" }}
              onClick={() => void exportFullAnalytics("csv")}
            >
              {isExportingReport ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
              {t("dashboard.fullCsv")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!data || isExportingReport}
              className="h-9 gap-2 rounded-xl border-border"
              onClick={() => void exportFullAnalytics("html")}
            >
              <LineChart className="size-4" />
              {t("dashboard.htmlCharts")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-9 rounded-xl"
              disabled={!data || isExportingReport}
              onClick={() => void exportFullAnalytics("both")}
            >
              {t("dashboard.bothExports")}
            </Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5 rounded-xl" onClick={resetLayout}>
              <RotateCcw className="size-3.5" />
              {t("dashboard.resetLayout")}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Timer className="size-3.5 shrink-0" aria-hidden />
            {t("dashboard.showingAnalytics", { days: rangeDays })}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("dashboard.widgetVisibleCount", { visible: visibleWidgetCount, total: CARD_IDS.length })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-xl border-border bg-background"
              onClick={() => setWidgetSettingsOpen(true)}
            >
              <LayoutGrid className="size-3.5" aria-hidden />
              {t("dashboard.widgetSettingsButton")}
            </Button>
          </div>
        </div>

        <Dialog open={widgetSettingsOpen} onOpenChange={setWidgetSettingsOpen}>
          <DialogContent className="max-h-[min(90vh,680px)] gap-0 overflow-hidden p-0 sm:max-w-lg">
            <DialogHeader className="border-b border-border px-6 pb-4 pt-6 pr-14 text-left">
              <DialogTitle>{t("dashboard.widgetSettingsTitle")}</DialogTitle>
              <DialogDescription>{t("dashboard.widgetSettingsDescription")}</DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(52vh,440px)] overflow-y-auto px-6 py-4">
              {WIDGET_PANEL_GROUPS.map((group, gi) => (
                <div key={group.groupTitleKey}>
                  {gi > 0 ? <Separator className="my-5" /> : null}
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(group.groupTitleKey)}
                  </p>
                  <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-card">
                    {group.items.map(({ id, labelKey }) => {
                      const visible = !prefs.hidden.includes(id);
                      return (
                        <li key={id} className="flex items-center justify-between gap-4 px-3 py-3 sm:px-4">
                          <span className="min-w-0 text-sm leading-snug text-foreground">{t(labelKey)}</span>
                          <Switch
                            checked={visible}
                            onCheckedChange={(checked) => setCardVisible(id, checked)}
                            className="shrink-0"
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-xl"
                  onClick={showAllWidgets}
                >
                  {t("dashboard.showAllWidgets")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={hideAllChartWidgets}
                >
                  {t("dashboard.hideChartWidgets")}
                </Button>
              </div>
              <Button
                type="button"
                size="sm"
                className="rounded-xl"
                onClick={() => setWidgetSettingsOpen(false)}
              >
                {t("dashboard.doneWidgets")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-6">
        <AnimatePresence mode="popLayout">
          {visibleCards.map((cardId, cardIndex) => {
            const cardSize = prefs.sizes[cardId] || "medium";
            return (
              <motion.div
                key={cardId}
                draggable
                onDragStart={() => setDraggedCard(cardId)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveCard(cardId)}
                className={spanClass(cardId, cardSize)}
                initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  ...springTransition,
                  delay: reduceMotion ? 0 : 0.045 * cardIndex + 0.08,
                }}
                exit={
                  reduceMotion
                    ? { opacity: 0, transition: { duration: 0 } }
                    : { opacity: 0, scale: 0.94, y: 12, transition: { duration: 0.22 } }
                }
                whileHover={reduceMotion ? undefined : { y: -2 }}
                whileTap={reduceMotion ? undefined : { scale: 0.998 }}
              >
                <div className="mb-2 flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="text-xs">{t(CARD_LABEL_KEY[cardId])}</span>
                  <div className="flex items-center gap-1">
                    {(["small", "medium", "large"] as CardSize[]).map((size) => (
                      <Button
                        key={size}
                        variant={cardSize === size ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setCardSize(cardId, size)}
                      >
                        {size[0].toUpperCase()}
                      </Button>
                    ))}
                    {CARD_META[cardId].isChart ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => exportCardCsv(cardId)}
                      >
                        <Download className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setCardVisible(cardId, false)}
                    >
                      <EyeOff className="size-3.5" />
                    </Button>
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                      <GripVertical className="size-3.5" />
                      {t("dashboard.drag")}
                    </span>
                  </div>
                </div>
                {content[cardId](cardSize)}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

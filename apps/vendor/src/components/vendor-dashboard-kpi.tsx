"use client";

import { useMemo } from "react";
import { ChevronDown, MoreHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import { DILIVYGO_CHART_CYAN, formatPrice, Skeleton } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import type { AnalyticsRangeDays, StatusBreakdownPoint, TimeSeriesPoint } from "@dilivygo/types";

const LIME_BG = "#C9F06A";
const LIME_ACCENT = "#B4E635";
const ORANGE_BG = "#FF5F29";
/** Slate panel aligned with logistics shell + cyan chart accent (not plain white). */
const DELIVERED_CARD_BG = "#1a2433";
const DELIVERED_CARD_BORDER = "rgba(34, 211, 238, 0.18)";
const SUCCESS = "#1C7C54";
const DANGER = "#CA054D";

export function statusMapFromBreakdown(breakdown: StatusBreakdownPoint[]): Map<string, number> {
  return new Map((breakdown || []).map((s) => [s.status, s.count]));
}

function lastNSeries(points: TimeSeriesPoint[], n: number): TimeSeriesPoint[] {
  if (!points.length) return [];
  return points.slice(-n);
}

type VendorPerformanceSnapshotProps = {
  isLoading: boolean;
  rangeDays: AnalyticsRangeDays;
  totalOrders: number;
  activeTracking: number;
  delivered: number;
  rangeRevenueCents: number;
  orderTrend: number;
  revenueTrend: number;
  activeTrend: number;
  assignedCount: number;
  pickedUpCount: number;
  arrivedCount: number;
  ordersByDay: TimeSeriesPoint[];
  currencyCode: string;
};

export function VendorPerformanceSnapshot(props: VendorPerformanceSnapshotProps) {
  const {
    isLoading,
    rangeDays,
    totalOrders,
    activeTracking,
    delivered,
    rangeRevenueCents,
    orderTrend,
    revenueTrend,
    activeTrend,
    assignedCount,
    pickedUpCount,
    arrivedCount,
    ordersByDay,
    currencyCode,
  } = props;

  const { t } = useTranslation("vendor");

  const pipelineRows = useMemo(() => {
    const total = Math.max(1, activeTracking);
    return [
      { label: t("orders.status.assigned"), count: assignedCount, pct: (assignedCount / total) * 100 },
      { label: t("orders.status.pickedUp"), count: pickedUpCount, pct: (pickedUpCount / total) * 100 },
      {
        label: t("orders.status.arrived"),
        count: arrivedCount,
        pct: (arrivedCount / total) * 100,
      },
    ];
  }, [activeTracking, assignedCount, arrivedCount, pickedUpCount, t]);

  const throughputBars = useMemo(() => {
    const slice = lastNSeries(ordersByDay, 10);
    const counts = slice.map((d) => d.orders ?? d.completed ?? 0);
    const max = Math.max(1, ...counts);
    return counts.map((c) => Math.round((c / max) * 100));
  }, [ordersByDay]);

  const revenueWeek = useMemo(() => {
    const slice = lastNSeries(ordersByDay, 7);
    const cents = slice.map((d) => d.revenueCents ?? 0);
    const max = Math.max(1, ...cents);
    const bars = cents.map((c) => Math.round((c / max) * 100));
    const dayLabels = slice.map((d) => {
      try {
        return new Intl.DateTimeFormat(undefined, { weekday: "narrow" }).format(new Date(`${d.date}T12:00:00`));
      } catch {
        return "·";
      }
    });
    return { bars, dayLabels };
  }, [ordersByDay]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OrdersLimeCard
        isLoading={isLoading}
        label={t("dashboard.orders")}
        value={totalOrders}
        trend={orderTrend}
        positiveGood
        footer={t("dashboard.showingAnalytics", { days: rangeDays })}
      />
      <ActivePipelineCard
        isLoading={isLoading}
        label={t("dashboard.kpiActiveTracking")}
        total={activeTracking}
        trend={activeTrend}
        positiveGood={false}
        rows={pipelineRows}
      />
      <DeliveredPerformanceCard
        isLoading={isLoading}
        label={t("dashboard.kpiDelivered")}
        value={delivered}
        trend={orderTrend}
        positiveGood
        subtitle={t("dashboard.showingAnalytics", { days: rangeDays })}
        barPercents={throughputBars}
      />
      <RevenueOrangeCard
        isLoading={isLoading}
        label={t("dashboard.revenue")}
        valueFormatted={formatPrice(rangeRevenueCents, currencyCode)}
        trend={revenueTrend}
        positiveGood
        barPercents={revenueWeek.bars}
        dayLabels={revenueWeek.dayLabels}
      />
    </div>
  );
}

function trendPill(trend: number, positiveGood: boolean, surface: "lime" | "dark" = "lime") {
  const up = trend >= 0;
  const good = positiveGood ? up : !up;
  const color = good ? SUCCESS : DANGER;
  const sign = up ? "+" : "";
  if (surface === "dark") {
    return (
      <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-200">
        <span style={{ color }} className="tabular-nums">
          {sign}
          {trend.toFixed(2)}%
        </span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{
        backgroundColor: "rgba(24, 24, 27, 0.12)",
        color: "#18181b",
      }}
    >
      <span style={{ color }} className="tabular-nums">
        {sign}
        {trend.toFixed(2)}%
      </span>
    </span>
  );
}

function OrdersLimeCard(props: {
  isLoading: boolean;
  label: string;
  value: number;
  trend: number;
  positiveGood: boolean;
  footer: string;
}) {
  const { isLoading, label, value, trend, positiveGood, footer } = props;
  const up = trend >= 0;
  const good = positiveGood ? up : !up;
  const arrowColor = good ? "#166534" : "#9f1239";

  return (
    <div
      className="relative flex min-h-[248px] flex-col overflow-hidden rounded-[28px] p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-[260px]"
      style={{ backgroundColor: LIME_BG }}
      role="group"
      aria-label={isLoading ? `${label}, loading` : `${label}, ${value}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-900/75">{label}</span>
        {!isLoading && trendPill(trend, positiveGood)}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 py-1">
        {isLoading ? (
          <Skeleton className="h-20 w-40 rounded-xl bg-zinc-900/10 sm:h-24 sm:w-48" />
        ) : (
          <div className="flex w-full min-w-0 justify-center">
            <span className="min-w-0 text-center text-6xl font-extrabold tabular-nums leading-none tracking-tight text-zinc-950 sm:text-7xl lg:text-8xl">
              {value}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-zinc-800/80">
          {isLoading ? <Skeleton className="h-4 w-40 rounded-md bg-zinc-900/10" /> : footer}
        </p>
        {!isLoading && (
          <span className="inline-flex size-5 shrink-0" style={{ color: arrowColor }} aria-hidden>
            {up ? <TrendingUp className="size-full" strokeWidth={2.25} /> : <TrendingDown className="size-full" strokeWidth={2.25} />}
          </span>
        )}
      </div>
    </div>
  );
}

function ActivePipelineCard(props: {
  isLoading: boolean;
  label: string;
  total: number;
  trend: number;
  positiveGood: boolean;
  rows: { label: string; count: number; pct: number }[];
}) {
  const { isLoading, label, total, trend, positiveGood, rows } = props;

  return (
    <div
      className="relative flex min-h-[248px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950 p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-[260px]"
      role="group"
      aria-label={isLoading ? `${label}, loading` : `${label}, ${total}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: LIME_ACCENT }}>
          {label}
        </span>
        <span
          className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-zinc-400"
          aria-hidden
        >
          <MoreHorizontal className="size-4" style={{ color: LIME_ACCENT }} />
        </span>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-center gap-3.5">
        {isLoading ? (
          <>
            <Skeleton className="h-4 w-full rounded-md bg-zinc-800" />
            <Skeleton className="h-4 w-full rounded-md bg-zinc-800" />
            <Skeleton className="h-4 w-full rounded-md bg-zinc-800" />
          </>
        ) : total === 0 ? (
          <p className="text-sm text-zinc-500">—</p>
        ) : (
          rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-zinc-400">{row.label}</span>
              <span className="shrink-0 tabular-nums text-zinc-200">{row.pct.toFixed(0)}%</span>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <span className="text-2xl font-bold tabular-nums text-white">{isLoading ? <Skeleton className="inline-block h-8 w-14 rounded-md bg-zinc-800" /> : total}</span>
        {!isLoading && total > 0 && trendPill(trend, positiveGood, "dark")}
      </div>
    </div>
  );
}

function DeliveredPerformanceCard(props: {
  isLoading: boolean;
  label: string;
  value: number;
  trend: number;
  positiveGood: boolean;
  subtitle: string;
  barPercents: number[];
}) {
  const { t } = useTranslation("vendor");
  const { isLoading, label, value, trend, positiveGood, subtitle, barPercents } = props;
  const bars = barPercents.length ? barPercents : Array(10).fill(0);
  const barMax = Math.max(1, ...bars);

  return (
    <div
      className="relative flex min-h-[248px] flex-col overflow-hidden rounded-[28px] p-6 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-[260px]"
      style={{
        backgroundColor: DELIVERED_CARD_BG,
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: DELIVERED_CARD_BORDER,
        boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset",
      }}
      role="group"
      aria-label={isLoading ? `${label}, loading` : `${label}, ${value}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">{label}</span>
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        </div>
        {!isLoading && (
          <span className="text-xl font-bold tabular-nums text-zinc-50 sm:text-2xl">{value}</span>
        )}
      </div>

      <div className="mt-5 flex min-h-[5.5rem] flex-1 items-end gap-1.5">
        {isLoading ? (
          <Skeleton className="h-full min-h-[5rem] w-full rounded-2xl bg-white/10" />
        ) : (
          bars.map((pct, i) => {
            const h = Math.max(12, pct);
            const isPeak = pct === barMax && pct > 0;
            return (
              <div key={i} className="flex h-24 flex-1 flex-col justify-end">
                <div
                  className="mx-auto w-[72%] min-w-[6px] max-w-[14px] rounded-full transition-all"
                  style={{
                    height: `${h}%`,
                    backgroundColor: DILIVYGO_CHART_CYAN,
                    opacity: 0.88,
                    boxShadow: isPeak ? `0 0 16px ${DILIVYGO_CHART_CYAN}55` : undefined,
                  }}
                >
                  {isPeak && (
                    <div
                      className="mx-auto mt-1 h-2 w-1 rounded-full shadow-sm"
                      style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
                      aria-hidden
                    />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <span className="text-zinc-500">{t("dashboard.orderVolumeTrend")}</span>
        {!isLoading && (
          <span className="font-semibold tabular-nums" style={{ color: positiveGood === (trend >= 0) ? SUCCESS : DANGER }}>
            {trend >= 0 ? "+" : ""}
            {trend.toFixed(2)}%{" "}
            <span className="font-normal text-zinc-500">{t("dashboard.kpiVsPrevShort")}</span>
          </span>
        )}
      </div>
    </div>
  );
}

function RevenueOrangeCard(props: {
  isLoading: boolean;
  label: string;
  valueFormatted: string;
  trend: number;
  positiveGood: boolean;
  barPercents: number[];
  dayLabels: string[];
}) {
  const { t } = useTranslation("vendor");
  const { isLoading, label, valueFormatted, trend, positiveGood, barPercents, dayLabels } = props;
  const up = trend >= 0;
  const trendGood = positiveGood ? up : !up;
  const bars = barPercents.length ? barPercents : Array(7).fill(0);
  const labels =
    dayLabels.length === bars.length ? dayLabels : ["S", "M", "T", "W", "T", "F", "S"].slice(0, bars.length);

  return (
    <div
      className="relative flex min-h-[248px] flex-col overflow-hidden rounded-[28px] p-6 text-zinc-950 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-[260px]"
      style={{ backgroundColor: ORANGE_BG }}
      role="group"
      aria-label={isLoading ? `${label}, loading` : `${label}, ${valueFormatted}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-950/80">{label}</span>
          {isLoading ? (
            <Skeleton className="mt-2 h-9 w-36 rounded-lg bg-black/10" />
          ) : (
            <p className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-zinc-950 sm:text-[2rem]">
              {valueFormatted}
            </p>
          )}
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-full border border-black/20 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-950"
          aria-hidden
        >
          7d
          <ChevronDown className="size-3.5 opacity-70" />
        </span>
      </div>

      <div className="mt-4 flex flex-1 items-end justify-between gap-1 sm:gap-1.5">
        {isLoading ? (
          <Skeleton className="h-28 w-full rounded-2xl bg-black/10" />
        ) : (
          bars.map((pct, i) => {
            const fill = Math.max(18, pct);
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="relative flex h-28 w-full max-w-[2.25rem] items-end justify-center rounded-full bg-black/15 p-1">
                  <div
                    className="w-full rounded-full bg-zinc-900/85"
                    style={{ height: `${fill}%` }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-zinc-950/70">{labels[i] ?? "·"}</span>
              </div>
            );
          })
        )}
      </div>

      <p
        className="mt-3 text-center text-[11px] font-bold tabular-nums text-zinc-950/85"
        style={{ color: trendGood ? SUCCESS : DANGER }}
      >
        {isLoading ? (
          <Skeleton className="mx-auto h-4 w-44 rounded-md bg-black/10" />
        ) : (
          t("dashboard.vsPreviousPeriod", {
            delta: `${trend >= 0 ? "+" : ""}${trend.toFixed(2)}`,
          })
        )}
      </p>
    </div>
  );
}

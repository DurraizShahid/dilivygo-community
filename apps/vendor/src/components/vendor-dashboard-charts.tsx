"use client";

import { useId, useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DilivygoDonutChart,
  DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME,
  HalftoneBarLtrFadeMaskDef,
  HalftonePatternDef,
  cn,
  formatPrice,
  halftoneBarLtrFadeMaskUrl,
  DILIVYGO_CHART_PEACH as PEACH,
  DILIVYGO_CHART_SKY as BLUE,
  DILIVYGO_CHART_LIME as LIME,
  DILIVYGO_CHART_VIOLET as VIOLET,
  DILIVYGO_CHART_CYAN as CYAN,
  DILIVYGO_CHART_AMBER as AMBER,
  DILIVYGO_CHART_ROSE as ROSE,
} from "@dilivygo/ui";
import type {
  AnalyticsRangeDays,
  PeakHourPoint,
  PopularItemPoint,
  StatusBreakdownPoint,
  TimeSeriesPoint,
} from "@dilivygo/types";
import { useDashboardChartChrome } from "@/hooks/use-dashboard-chart-chrome";
import { useTranslation } from "@dilivygo/i18n";

type OBDSeries = TimeSeriesPoint[];

// Re-export chart accents for other superadmin modules.
export { PEACH, BLUE, LIME, VIOLET, CYAN, AMBER, ROSE };

// ─── Tooltip shell ────────────────────────────────────────────────────────────
export function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-popover px-3 py-2.5 text-xs text-popover-foreground">
      {children}
    </div>
  );
}

// ─── ChartCard ────────────────────────────────────────────────────────────────
export function ChartCard({
  title,
  subtitle,
  children,
  className,
  action,
  variant = "surface",
  headerRowClassName,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  /** Extra classes on the title/action row (e.g. `mb-2` for denser dashboard pairs). */
  headerRowClassName?: string;
  /**
   * `surface` — themed card (`--card` / `--border`).
   * `transparent` — no panel fill; for charts that read cleaner on the page backdrop.
   * `glass` / `solid` — legacy aliases for `surface`.
   */
  variant?: "surface" | "transparent" | "glass" | "solid";
}) {
  const mode =
    variant === "glass" || variant === "solid" ? "surface" : variant;
  return (
    <div
      className={cn(
        "relative flex flex-col p-5",
        mode === "surface" && "dashboard-glass-panel overflow-hidden rounded-[24px]",
        mode === "transparent" &&
          "overflow-visible rounded-[24px] border-0 bg-transparent shadow-none ring-0",
        className,
      )}
    >
      <div
        className={cn(
          "relative z-[1] mb-4 flex items-start justify-between gap-3",
          headerRowClassName,
        )}
      >
        <div className={cn("min-w-0", mode === "transparent" && "pl-px")}>
          <p className="text-sm font-semibold tracking-tight text-card-foreground">
            {title}
          </p>
          {subtitle && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ─── RangeSelector ────────────────────────────────────────────────────────────
const RANGES: { label: string; days: AnalyticsRangeDays }[] = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export function RangeSelector({
  value,
  onChange,
}: {
  value: AnalyticsRangeDays;
  onChange: (v: AnalyticsRangeDays) => void;
}) {
  return (
    <div className="flex gap-1">
      {RANGES.map((r) => {
        const active = r.days === value;
        return (
          <button
            key={r.days}
            type="button"
            onClick={() => onChange(r.days)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
              active
                ? "text-[#0a0a0f]"
                : "bg-muted text-muted-foreground hover:text-foreground",
            )}
            style={active ? { background: PEACH } : undefined}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── MiniSparkline ────────────────────────────────────────────────────────────
export function MiniSparkline({
  data,
  color = PEACH,
}: {
  data: number[];
  color?: string;
}) {
  const pts = useMemo(() => data.map((v, i) => ({ i, v })), [data]);
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={color}
          fillOpacity={0.2}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── StatBadge — inline colored number with label ─────────────────────────────
export function StatBadge({
  label,
  value,
  color = PEACH,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="text-xl font-bold tabular-nums text-card-foreground" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

// ─── Chart legend row ─────────────────────────────────────────────────────────
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-1.5 text-[11px]">
          <span
            className="inline-block size-2 shrink-0 rounded-full align-middle"
            style={{ background: it.color }}
          />
          <span className="text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── PeakHoursBarChart ────────────────────────────────────────────────────────
export function PeakHoursBarChart({
  data,
}: {
  data: PeakHourPoint[];
}) {
  const { t } = useTranslation("vendor");
  const chrome = useDashboardChartChrome();
  const hid = useId().replace(/:/g, "");
  const maxV = useMemo(
    () => Math.max(1, ...data.map((d) => d.orders ?? 0)),
    [data],
  );
  const hourMap = useMemo(
    () => new Map(data.map((d) => [Number(d.hour), d.orders ?? 0])),
    [data],
  );
  const pts = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const v = hourMap.get(h) ?? 0;
        const x = v / maxV;
        return {
          h,
          label:
            h === 0
              ? "12a"
              : h < 12
                ? `${h}a`
                : h === 12
                  ? "12p"
                  : `${h - 12}p`,
          orders: v,
          intensity: x,
        };
      }),
    [hourMap, maxV],
  );

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={pts} margin={{ top: 5, right: 2, left: -22, bottom: 0 }}>
        <defs>
          {pts.map((e) => {
            const r = Math.round(163 + e.intensity * 55);
            const g = Math.round(210 + e.intensity * 22);
            const b = 40;
            const dot = `rgb(${r},${g},${b})`;
            const ground = chrome.peakBarGround(e.intensity);
            return (
              <HalftonePatternDef
                key={e.h}
                id={`${hid}-ph-${e.h}`}
                dotColor={dot}
                groundColor={ground}
              />
            );
          })}
          <HalftoneBarLtrFadeMaskDef baseId={hid} />
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: chrome.tick, fontSize: 9 }}
          axisLine={false}
          tickLine={false}
          interval={3}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: chrome.cursorFill }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const e = payload[0]?.payload as { label: string; orders: number };
            return (
              <Tip>
                <p className="text-muted-foreground">{e.label}</p>
                <p className="font-semibold text-foreground">
                  {t("dashboard.tooltipOrdersCount", { count: e.orders })}
                </p>
              </Tip>
            );
          }}
        />
        <Bar
          dataKey="orders"
          radius={[3, 3, 0, 0]}
          mask={halftoneBarLtrFadeMaskUrl(hid)}
        >
          {pts.map((e) => (
            <Cell key={e.h} fill={`url(#${hid}-ph-${e.h})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── StatusDonutChart ─────────────────────────────────────────────────────────
type OpsStatusKey = "delivered" | "inTransit" | "processing" | "pending" | "cancelled";

const STATUS_DEF: { key: OpsStatusKey; color: string }[] = [
  { key: "delivered", color: LIME },
  { key: "inTransit", color: CYAN },
  { key: "processing", color: BLUE },
  { key: "pending", color: AMBER },
  { key: "cancelled", color: ROSE },
];

function groupStatuses(
  data: StatusBreakdownPoint[],
) {
  const m: Record<OpsStatusKey, number> = {
    delivered: 0,
    inTransit: 0,
    processing: 0,
    pending: 0,
    cancelled: 0,
  };
  for (const { status, count } of data) {
    if (status === "completed") m.delivered += count;
    else if (["assigned", "picked_up", "arrived"].includes(status))
      m.inTransit += count;
    else if (["accepted", "preparing", "ready"].includes(status))
      m.processing += count;
    else if (["placed", "scheduled"].includes(status)) m.pending += count;
    else m.cancelled += count;
  }
  return STATUS_DEF.map(({ key, color }) => ({
    nameKey: key,
    color,
    value: m[key],
  })).filter((g) => g.value > 0);
}

export function StatusDonutChart({
  data,
}: {
  data: StatusBreakdownPoint[];
}) {
  const { t } = useTranslation("vendor");
  const groups = useMemo(() => groupStatuses(data), [data]);
  const total = groups.reduce((s, g) => s + g.value, 0);

  return (
    <div className="flex flex-col items-center gap-4">
      <DilivygoDonutChart
        segments={groups.map((g) => ({
          key: g.nameKey,
          value: g.value,
          color: g.color,
          label: t(`dashboard.opsStatus.${g.nameKey}`),
        }))}
        size={164}
        center={
          <>
            <span className="text-2xl font-semibold tracking-tight text-foreground">{total}</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("dashboard.donutCenterOrders")}
            </span>
          </>
        }
        aria-label={t("dashboard.chartOrderStatusAria")}
      />
      <div className="w-full space-y-1.5">
        {groups.map((g) => (
          <div key={g.nameKey} className="flex items-center gap-2 text-[11px]">
            <span
              className={DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME}
              style={{ background: g.color }}
            />
            <span className="min-w-0 flex-1 text-muted-foreground">
              {t(`dashboard.opsStatus.${g.nameKey}`)}
            </span>
            <span className="font-semibold text-foreground">{g.value}</span>
            <span className="w-9 text-right text-muted-foreground">
              {total > 0 ? `${Math.round((g.value / total) * 100)}%` : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Popular items leaderboard (mirrors superadmin workspace bar chart) ───────
export function PopularItemsBarChart({
  data,
  currency,
}: {
  data: PopularItemPoint[];
  currency: string;
}) {
  const chrome = useDashboardChartChrome();
  const hid = useId().replace(/:/g, "");
  const pts = useMemo(
    () =>
      [...data]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 7)
        .map((item) => ({
          name: (item.name || "Item").slice(0, 22),
          quantity: item.quantity,
          revenueCents: item.revenueCents,
        })),
    [data],
  );

  const chartH = Math.max(160, pts.length * 38);

  return (
    <ResponsiveContainer width="100%" height={chartH}>
      <BarChart
        data={pts}
        layout="vertical"
        margin={{ top: 0, right: 14, left: 0, bottom: 0 }}
      >
        <defs>
          <HalftonePatternDef id={`${hid}-pi`} dotColor={PEACH} groundColor={chrome.halftoneBarGround} />
          <HalftoneBarLtrFadeMaskDef baseId={hid} />
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chrome.grid}
          horizontal={false}
        />
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: chrome.tick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={115}
        />
        <Tooltip
          cursor={{ fill: chrome.cursorFill }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]?.payload as {
              name: string;
              quantity: number;
              revenueCents: number;
            };
            return (
              <Tip>
                <p className="mb-1.5 font-semibold text-foreground">{p.name}</p>
                <p className="text-muted-foreground">
                  Sold:{" "}
                  <span className="font-semibold text-foreground">{p.quantity}</span>
                </p>
                <p className="text-muted-foreground">
                  Revenue:{" "}
                  <span className="font-semibold text-foreground">
                    {formatPrice(p.revenueCents, currency)}
                  </span>
                </p>
              </Tip>
            );
          }}
        />
        <Bar
          dataKey="quantity"
          fill={`url(#${hid}-pi)`}
          radius={[0, 4, 4, 0]}
          name="quantity"
          mask={halftoneBarLtrFadeMaskUrl(hid)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── RevenueAreaChart ─────────────────────────────────────────────────────────
export function RevenueAreaChart({
  data,
  currency,
  color = VIOLET,
  height = 150,
}: {
  data: OBDSeries;
  currency: string;
  color?: string;
  height?: number;
}) {
  const chrome = useDashboardChartChrome();
  const uid = useId();
  const gid = `rev-${uid.replace(/:/g, "x")}`;
  const pts = useMemo(
    () =>
      data.map((d) => ({
        date: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        revenue: Math.round((d.revenueCents ?? 0) / 100),
      })),
    [data],
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={pts} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.44} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: chrome.tick, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: chrome.tick, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={42}
          tickFormatter={(v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
          }
        />
        <Tooltip
          cursor={{ stroke: chrome.cursorStroke, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <Tip>
                <p className="text-muted-foreground">{label}</p>
                <p className="font-semibold text-foreground">
                  {formatPrice((payload[0]?.value as number) * 100, currency)}
                </p>
              </Tip>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gid})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── AovLineChart ─────────────────────────────────────────────────────────────
export function AovLineChart({
  data,
  currency,
}: {
  data: OBDSeries;
  currency: string;
}) {
  const chrome = useDashboardChartChrome();
  const pts = useMemo(
    () =>
      data
        .map((d) => {
          const orders = d.orders ?? 0;
          const rev = d.revenueCents ?? 0;
          return {
            date: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric" },
            ),
            aov: orders > 0 ? Math.round(rev / orders / 100) : 0,
          };
        })
        .filter((d) => d.aov > 0),
    [data],
  );

  return (
    <ResponsiveContainer width="100%" height={130}>
      <AreaChart data={pts} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="cht-aov" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CYAN} stopOpacity={0.42} />
            <stop offset="95%" stopColor={CYAN} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: chrome.tick, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: chrome.tick, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          cursor={{ stroke: chrome.cursorStroke, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <Tip>
                <p className="text-muted-foreground">{label}</p>
                <p className="font-semibold text-foreground">
                  AOV: {formatPrice((payload[0]?.value as number) * 100, currency)}
                </p>
              </Tip>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="aov"
          stroke={CYAN}
          strokeWidth={2}
          fill="url(#cht-aov)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── CompletionBarChart ───────────────────────────────────────────────────────
export function CompletionBarChart({ data }: { data: OBDSeries }) {
  const chrome = useDashboardChartChrome();
  const hid = useId().replace(/:/g, "");
  const pts = useMemo(
    () =>
      data.slice(-14).map((d) => ({
        date: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        completed: d.completed ?? 0,
        other: Math.max(0, (d.orders ?? 0) - (d.completed ?? 0)),
      })),
    [data],
  );

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={pts} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
        <defs>
          <HalftonePatternDef id={`${hid}-cmp-lime`} dotColor={LIME} groundColor={chrome.halftoneBarGround} />
          <HalftonePatternDef
            id={`${hid}-cmp-other`}
            dotColor={chrome.halftoneOtherDot}
            groundColor={chrome.halftoneOtherGround}
          />
          <HalftoneBarLtrFadeMaskDef baseId={hid} />
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: chrome.tick, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: chrome.cursorFill }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <Tip>
                <p className="mb-1 text-muted-foreground">{label}</p>
                {payload.map((p) => (
                  <div
                    key={p.dataKey as string}
                    className="flex items-center gap-1.5"
                  >
                    <span
                      className="inline-block size-1.5 shrink-0 rounded-full align-middle"
                      style={{
                        background:
                          p.dataKey === "completed" ? LIME : chrome.halftoneOtherDot,
                      }}
                    />
                    <span className="capitalize text-muted-foreground">{p.name}:</span>
                    <span className="font-semibold text-foreground">{p.value}</span>
                  </div>
                ))}
              </Tip>
            );
          }}
        />
        <Bar
          dataKey="completed"
          stackId="s"
          fill={`url(#${hid}-cmp-lime)`}
          name="delivered"
          mask={halftoneBarLtrFadeMaskUrl(hid)}
        />
        <Bar
          dataKey="other"
          stackId="s"
          fill={`url(#${hid}-cmp-other)`}
          radius={[3, 3, 0, 0]}
          name="in-progress"
          mask={halftoneBarLtrFadeMaskUrl(hid)}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── PushStatusDonut ──────────────────────────────────────────────────────────
export function PushStatusDonut({
  draft,
  sending,
  sent,
  failed,
}: {
  draft: number;
  sending: number;
  sent: number;
  failed: number;
}) {
  const { t } = useTranslation("vendor");
  const segments = useMemo(
    () =>
      (
        [
          { statusKey: "sent" as const, value: sent, color: LIME },
          { statusKey: "sending" as const, value: sending, color: CYAN },
          { statusKey: "draft" as const, value: draft, color: AMBER },
          { statusKey: "failed" as const, value: failed, color: ROSE },
        ] as const
      )
        .map((s) => ({
          ...s,
          label: t(`dashboard.pushCampaignStatus.${s.statusKey}`),
        }))
        .filter((s) => s.value > 0),
    [draft, sending, sent, failed, t],
  );
  const total = segments.reduce((s, g) => s + g.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">
        {t("dashboard.pushNoCampaignsYet")}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <DilivygoDonutChart
        segments={segments.map((s) => ({
          key: s.statusKey,
          value: s.value,
          color: s.color,
          label: s.label,
        }))}
        size={130}
        thicknessRatio={0.36}
        gapDegrees={3.5}
        center={
          <>
            <span className="text-lg font-semibold tracking-tight text-foreground">{total}</span>
            <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("dashboard.donutCenterTotal")}
            </span>
          </>
        }
        aria-label={t("dashboard.chartPushCampaignAria")}
      />
      <div className="flex flex-col gap-2.5">
        {segments.map((s) => (
          <div key={s.statusKey} className="flex items-center gap-2 text-xs">
            <span
              className={DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME}
              style={{ background: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-semibold text-foreground">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── StarDistributionChart ────────────────────────────────────────────────────
export function StarDistributionChart({
  distribution,
}: {
  distribution?: Record<number, number> | null;
}) {
  const { t } = useTranslation("vendor");
  const rows = useMemo(
    () => [5, 4, 3, 2, 1].map((star) => ({ star, count: distribution?.[star] ?? 0 })),
    [distribution],
  );
  const max = Math.max(1, ...rows.map((r) => r.count));
  const STAR_COLORS = [LIME, LIME, AMBER, AMBER, ROSE];

  if (!distribution || rows.every((r) => r.count === 0)) {
    return (
      <div className="flex h-28 items-center justify-center text-sm text-muted-foreground">
        {t("dashboard.noRatingsYet")}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r.star} className="flex items-center gap-3 text-xs">
          <span className="w-5 shrink-0 text-right font-medium text-muted-foreground">
            {r.star}★
          </span>
          <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
              style={{
                width: `${(r.count / max) * 100}%`,
                background: STAR_COLORS[i],
              }}
            />
          </div>
          <span className="w-7 shrink-0 tabular-nums text-muted-foreground">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

// ─── MarketingBarChart ────────────────────────────────────────────────────────
export function MarketingBarChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const chrome = useDashboardChartChrome();
  const hid = useId().replace(/:/g, "");
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart
        data={data}
        margin={{ top: 5, right: 5, left: -22, bottom: 0 }}
      >
        <defs>
          {data.map((d, i) => (
            <HalftonePatternDef
              key={d.label}
              id={`${hid}-mkt-${i}`}
              dotColor={d.color}
              groundColor={chrome.halftoneBarGround}
            />
          ))}
          <HalftoneBarLtrFadeMaskDef baseId={hid} />
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={chrome.grid} vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: chrome.tick, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: chrome.cursorFill }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]?.payload as {
              label: string;
              value: number;
            };
            return (
              <Tip>
                <p className="text-muted-foreground">{p.label}</p>
                <p className="font-semibold text-foreground">{p.value}</p>
              </Tip>
            );
          }}
        />
        <Bar
          dataKey="value"
          radius={[4, 4, 0, 0]}
          mask={halftoneBarLtrFadeMaskUrl(hid)}
        >
          {data.map((d, i) => (
            <Cell key={d.label} fill={`url(#${hid}-mkt-${i})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── PlatformHealthRow ────────────────────────────────────────────────────────
export function PlatformHealthRow({
  items,
}: {
  items: { label: string; value: string | number; status: "ok" | "warn" | "info" }[];
}) {
  const STATUS_COLOR = { ok: LIME, warn: AMBER, info: BLUE };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <div
          key={it.label}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <span
            className={DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME}
            style={{ background: STATUS_COLOR[it.status] }}
          />
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted-foreground">{it.label}</p>
            <p className="truncate text-sm font-semibold text-foreground">{it.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

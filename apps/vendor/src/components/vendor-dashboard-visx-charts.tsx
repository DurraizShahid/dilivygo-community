"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { AxisBottom, AxisLeft, AxisRight } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { localPoint } from "@visx/event";
import { GridColumns, GridRows } from "@visx/grid";
import { LinearGradient } from "@visx/gradient";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleBand, scaleLinear } from "@visx/scale";
import { AreaClosed, Bar, LinePath } from "@visx/shape";
import {
  HalftoneBarLtrFadeMaskDef,
  HalftonePatternDef,
  formatPrice,
  halftoneBarLtrFadeMaskUrl,
} from "@dilivygo/ui";
import type { PeakHourPoint, TimeSeriesPoint } from "@dilivygo/types";
import {
  HEAT_WEEKDAYS,
  buildHeatMatrix,
  heatCellRgba,
  matrixStats,
} from "@/lib/dashboard-heat-matrix";
import { CYAN, LIME, PEACH, Tip } from "@/components/vendor-dashboard-charts";
import {
  DualAxisDottedTrendLine,
  DualAxisHalftoneColumns,
  DualAxisMountainBackdrop,
  DualAxisVerticalDottedGrid,
} from "@/components/dual-chart-particles";
import { useDualChartLiteMode } from "@/hooks/use-dual-chart-lite-mode";
import { useDashboardChartChrome } from "@/hooks/use-dashboard-chart-chrome";

export type OBDSeries = TimeSeriesPoint[];

export function VisxOrdersRevenueDualChart({
  data,
  currency,
  width,
  height,
}: {
  data: OBDSeries;
  currency: string;
  width: number;
  height: number;
}) {
  const margin = { top: 12, right: 46, bottom: 28, left: 36 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const pts = useMemo(
    () =>
      data.map((d, i) => ({
        i,
        label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        orders: d.orders ?? 0,
        revenue: Math.round((d.revenueCents ?? 0) / 100),
      })),
    [data],
  );

  const maxO = Math.max(1, ...pts.map((p) => p.orders));
  const maxR = Math.max(1, ...pts.map((p) => p.revenue));

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Math.max(1, pts.length - 1)],
        range: [0, innerW],
      }),
    [innerW, pts.length],
  );

  const yScaleL = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxO],
        range: [innerH, 0],
      }),
    [innerH, maxO],
  );

  const yScaleR = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxR],
        range: [innerH, 0],
      }),
    [innerH, maxR],
  );

  const [tip, setTip] = useState<{
    x: number;
    y: number;
    label: string;
    orders: number;
    revenue: number;
  } | null>(null);

  const onMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const pt = localPoint(event);
      if (!pt || !innerW) return;
      const x = pt.x - margin.left;
      const idx = Math.round((x / innerW) * (pts.length - 1));
      const clamped = Math.max(0, Math.min(pts.length - 1, idx));
      const p = pts[clamped];
      if (!p) return;
      setTip({
        x: pt.x,
        y: pt.y,
        label: p.label,
        orders: p.orders,
        revenue: p.revenue,
      });
    },
    [innerW, margin.left, pts],
  );

  const ordersPts = useMemo(
    () => pts.map((p) => ({ i: p.i, v: p.orders })),
    [pts],
  );
  const revenuePts = useMemo(
    () => pts.map((p) => ({ i: p.i, v: p.revenue })),
    [pts],
  );

  const gridTickXs = useMemo(() => {
    const step = Math.max(1, Math.ceil(pts.length / 6));
    return pts
      .filter((_, i) => i % step === 0)
      .map((p) => xScale(p.i) ?? 0);
  }, [pts, xScale]);

  const plotGradId = useId().replace(/:/g, "");
  const lite = useDualChartLiteMode();
  const chrome = useDashboardChartChrome();

  if (width < 32 || height < 32 || pts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No series data
      </div>
    );
  }

  return (
    <svg width={width} height={height} className="touch-none select-none">
      <defs>
        <linearGradient id={`${plotGradId}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={chrome.dualFloorStopColor} stopOpacity={0} />
          <stop offset="78%" stopColor={chrome.dualFloorStopColor} stopOpacity={0} />
          <stop
            offset="100%"
            stopColor={chrome.dualFloorStopColor}
            stopOpacity={chrome.dualFloorStopOpacity100}
          />
        </linearGradient>
      </defs>
      <Group left={margin.left} top={margin.top}>
        <DualAxisMountainBackdrop innerW={innerW} innerH={innerH} seed={8801} lite={lite} />
        <DualAxisVerticalDottedGrid tickXs={gridTickXs} innerH={innerH} lite={lite} />
        <DualAxisHalftoneColumns
          pts={ordersPts}
          yAt={(v) => yScaleL(v) ?? 0}
          innerW={innerW}
          innerH={innerH}
          color={PEACH}
          peakColor="#ffcbb0"
          seed={101}
          maxOpacity={0.48}
          lite={lite}
        />
        <DualAxisHalftoneColumns
          pts={revenuePts}
          yAt={(v) => yScaleR(v) ?? 0}
          innerW={innerW}
          innerH={innerH}
          color={CYAN}
          peakColor="#b5f7ff"
          seed={509}
          maxOpacity={0.44}
          lite={lite}
        />
        <rect
          width={innerW}
          height={innerH}
          fill={`url(#${plotGradId}-floor)`}
          className="pointer-events-none"
        />
        <DualAxisDottedTrendLine
          pts={ordersPts}
          xAt={(i) => xScale(i) ?? 0}
          yAt={(v) => yScaleL(v) ?? 0}
          color={PEACH}
          lite={lite}
        />
        <DualAxisDottedTrendLine
          pts={revenuePts}
          xAt={(i) => xScale(i) ?? 0}
          yAt={(v) => yScaleR(v) ?? 0}
          color={CYAN}
          lite={lite}
        />
        <AxisLeft
          left={0}
          scale={yScaleL}
          tickValues={yScaleL.ticks(4)}
          stroke="transparent"
          tickStroke="transparent"
          tickLabelProps={() => ({
            fill: chrome.axisOrdersTick,
            fontSize: 10,
            fontWeight: 500,
            style: { fontVariantNumeric: "tabular-nums" },
            textAnchor: "end",
            dx: -4,
            dy: 3,
          })}
        />
        <AxisRight
          left={innerW}
          scale={yScaleR}
          tickValues={yScaleR.ticks(4)}
          stroke="transparent"
          tickStroke="transparent"
          tickFormat={(v) => (Number(v) >= 1000 ? `${(Number(v) / 1000).toFixed(0)}k` : String(v))}
          tickLabelProps={() => ({
            fill: chrome.axisRevenueTick,
            fontSize: 10,
            fontWeight: 500,
            style: { fontVariantNumeric: "tabular-nums" },
            textAnchor: "start",
            dx: 4,
            dy: 3,
          })}
        />
        <AxisBottom
          top={innerH}
          scale={xScale}
          tickValues={pts.filter((_, i) => i % Math.ceil(pts.length / 6) === 0).map((p) => p.i)}
          tickFormat={(i) => pts[Number(i)]?.label ?? ""}
          stroke={chrome.axisLine}
          strokeDasharray="1 7"
          tickStroke="transparent"
          tickLabelProps={() => ({
            fill: chrome.axisXTick,
            fontSize: 10,
            fontWeight: 500,
            style: { fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" },
            textAnchor: "middle",
            dy: 6,
          })}
        />
        <rect
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setTip(null)}
          style={{ cursor: "crosshair" }}
        />
      </Group>
      {tip ? (
        <foreignObject
          x={Math.min(width - 200, tip.x + 12)}
          y={Math.max(8, tip.y - 72)}
          width={188}
          height={88}
        >
          <Tip>
            <p className="mb-1.5 font-medium text-muted-foreground">{tip.label}</p>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: PEACH }} />
              <span className="text-muted-foreground">orders:</span>
              <span className="font-semibold text-foreground">{tip.orders}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="size-1.5 rounded-full" style={{ background: CYAN }} />
              <span className="text-muted-foreground">revenue:</span>
              <span className="font-semibold text-foreground">
                {formatPrice(tip.revenue * 100, currency)}
              </span>
            </div>
          </Tip>
        </foreignObject>
      ) : null}
    </svg>
  );
}

export function VisxOrdersRevenueDualResponsive(props: {
  data: OBDSeries;
  currency: string;
  /** Fixed plot height (default matches dashboard home). */
  chartHeight?: number;
}) {
  const { chartHeight = 220, ...chartProps } = props;
  return (
    <ParentSize
      debounceTime={16}
      className="w-full"
      parentSizeStyles={{ width: "100%", height: chartHeight, flexShrink: 0 }}
    >
      {({ width, height }) =>
        width > 8 && height > 8 ? (
          <VisxOrdersRevenueDualChart width={width} height={height} {...chartProps} />
        ) : null
      }
    </ParentSize>
  );
}

export function VisxDemandHeatmap({
  ordersByDay,
  peakHours,
  width,
  height,
}: {
  ordersByDay: OBDSeries;
  peakHours: PeakHourPoint[];
  width: number;
  height: number;
}) {
  const matrix = useMemo(() => buildHeatMatrix(ordersByDay, peakHours), [ordersByDay, peakHours]);
  const stats = useMemo(() => matrixStats(matrix), [matrix]);
  const max = Math.max(1, ...matrix.flat());

  const margin = { top: 8, right: 8, bottom: 8, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const cols = 12;
  const rows = 7;

  const xScale = useMemo(
    () =>
      scaleBand<number>({
        domain: Array.from({ length: cols }, (_, i) => i),
        range: [0, innerW],
        padding: 0.12,
      }),
    [innerW],
  );

  const yScale = useMemo(
    () =>
      scaleBand<number>({
        domain: Array.from({ length: rows }, (_, i) => i),
        range: [0, innerH],
        padding: 0.15,
      }),
    [innerH],
  );

  const chrome = useDashboardChartChrome();

  if (width < 40 || height < 40) return null;

  return (
    <svg width={width} height={height}>
      <Group left={margin.left} top={margin.top}>
        {matrix.map((row, ri) =>
          row.map((cell, ci) => {
            const bw = xScale.bandwidth();
            const bh = yScale.bandwidth();
            const x = xScale(ci) ?? 0;
            const y = yScale(ri) ?? 0;
            const fill = heatCellRgba(cell, max, chrome.isLight);
            return (
              <rect
                key={`${ri}-${ci}`}
                x={x}
                y={y}
                width={bw}
                height={bh}
                rx={5}
                fill={fill}
                stroke={chrome.heatCellStroke}
                strokeWidth={1}
              />
            );
          }),
        )}
      </Group>
      {HEAT_WEEKDAYS.map((d, i) => (
        <text
          key={d}
          x={margin.left - 6}
          y={(margin.top + (yScale(i) ?? 0) + yScale.bandwidth() / 2 + 4)}
          textAnchor="end"
          fill={chrome.tick}
          fontSize={10}
          fontWeight={500}
        >
          {d}
        </text>
      ))}
      <text x={margin.left} y={height - 2} fill={chrome.tick} fontSize={9}>
        2h blocks → {stats.max ? `peak ${stats.max}` : "—"}
      </text>
    </svg>
  );
}

export function VisxDemandHeatmapResponsive(props: {
  ordersByDay: OBDSeries;
  peakHours: PeakHourPoint[];
}) {
  return (
    <ParentSize
      debounceTime={16}
      className="min-h-0 w-full flex-1"
      parentSizeStyles={{ width: "100%", height: "100%", minHeight: 0, flex: "1 1 0%" }}
    >
      {({ width, height }) =>
        width > 8 && height > 8 ? (
          <VisxDemandHeatmap width={width} height={height} {...props} />
        ) : null
      }
    </ParentSize>
  );
}

export function VisxNeonPeakBars({
  data,
  width,
  height,
}: {
  data: PeakHourPoint[];
  width: number;
  height: number;
}) {
  const margin = { top: 10, right: 6, bottom: 22, left: 0 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const maxV = useMemo(() => Math.max(1, ...data.map((d) => d.orders ?? 0)), [data]);
  const hourMap = useMemo(
    () => new Map(data.map((d) => [Number(d.hour), d.orders ?? 0])),
    [data],
  );

  const pts = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => {
        const v = hourMap.get(h) ?? 0;
        const label =
          h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
        return { h, v, label, intensity: v / maxV };
      }),
    [hourMap, maxV],
  );

  const xScale = useMemo(
    () =>
      scaleBand<number>({
        domain: pts.map((p) => p.h),
        range: [0, innerW],
        padding: 0.25,
      }),
    [innerW, pts],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxV],
        range: [innerH, 0],
      }),
    [innerH, maxV],
  );

  const hid = useId().replace(/:/g, "");
  const chrome = useDashboardChartChrome();

  if (width < 40 || height < 40) return null;

  return (
    <svg width={width} height={height}>
      <defs>
        <filter id={`${hid}-nb-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {pts.map((p) => {
          const r = Math.round(28 + p.intensity * 165);
          const g = Math.round(124 + p.intensity * 99);
          const b = Math.round(84 + p.intensity * (31 - 84));
          const dot = `rgb(${r},${g},${b})`;
          const ground = chrome.peakBarGround(p.intensity);
          return (
            <HalftonePatternDef
              key={p.h}
              id={`${hid}-vpk-${p.h}`}
              dotColor={dot}
              groundColor={ground}
            />
          );
        })}
        <HalftoneBarLtrFadeMaskDef baseId={hid} />
      </defs>
      <Group left={margin.left} top={margin.top}>
        <GridRows scale={yScale} width={innerW} stroke={chrome.grid} strokeDasharray="2 5" numTicks={3} />
        {pts.map((p) => {
          const x = xScale(p.h) ?? 0;
          const bw = xScale.bandwidth();
          const barH = innerH - (yScale(p.v) ?? innerH);
          const y = innerH - barH;
          /* #1C7C54 → #C1DF1F by intensity */
          return (
            <Group key={p.h}>
              <title>{`${p.label}: ${p.v} orders`}</title>
              <Bar
                x={x}
                y={y}
                width={bw}
                height={Math.max(barH, 0)}
                fill={`url(#${hid}-vpk-${p.h})`}
                rx={5}
                filter={`url(#${hid}-nb-glow)`}
                mask={halftoneBarLtrFadeMaskUrl(hid)}
              />
            </Group>
          );
        })}
        <AxisBottom
          top={innerH}
          scale={xScale}
          tickValues={pts.filter((p) => p.h % 4 === 0).map((p) => p.h)}
          tickFormat={(h) => pts.find((p) => p.h === h)?.label ?? ""}
          stroke="transparent"
          tickStroke="transparent"
          tickLabelProps={() => ({
            fill: chrome.tick,
            fontSize: 9,
            textAnchor: "middle",
            dy: 8,
          })}
        />
      </Group>
    </svg>
  );
}

export function VisxNeonPeakBarsResponsive(props: {
  data: PeakHourPoint[];
  /** Fixed plot height — avoids grid row stretch blowing the card to viewport height. */
  chartHeight?: number;
}) {
  const { chartHeight = 200, ...chartProps } = props;
  return (
    <ParentSize
      debounceTime={16}
      className="w-full"
      parentSizeStyles={{ width: "100%", height: chartHeight, flexShrink: 0 }}
    >
      {({ width, height }) =>
        width > 8 && height > 8 ? (
          <VisxNeonPeakBars width={width} height={height} {...chartProps} />
        ) : null
      }
    </ParentSize>
  );
}

export function VisxPulseAovChart({
  data,
  currency,
  width,
  height,
}: {
  data: OBDSeries;
  currency: string;
  width: number;
  height: number;
}) {
  const margin = { top: 10, right: 10, bottom: 24, left: 34 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const pts = useMemo(
    () =>
      data
        .map((d, i) => {
          const orders = d.orders ?? 0;
          const rev = d.revenueCents ?? 0;
          const aov = orders > 0 ? Math.round(rev / orders / 100) : 0;
          return {
            i,
            label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
            aov,
          };
        })
        .filter((d) => d.aov > 0),
    [data],
  );

  const maxA = Math.max(1, ...pts.map((p) => p.aov));

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Math.max(1, pts.length - 1)],
        range: [0, innerW],
      }),
    [innerW, pts.length],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxA],
        range: [innerH, 0],
      }),
    [innerH, maxA],
  );

  const uid = useId().replace(/:/g, "");
  const chrome = useDashboardChartChrome();

  const scatter = useMemo(
    () =>
      pts.map((p) => ({
        x: xScale(p.i) ?? 0,
        y: yScale(p.aov) ?? 0,
        aov: p.aov,
      })),
    [pts, xScale, yScale],
  );

  if (width < 40 || height < 40 || pts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No AOV data
      </div>
    );
  }

  return (
    <svg width={width} height={height}>
      <defs>
        <LinearGradient
          id={`${uid}-aov`}
          from={CYAN}
          to={LIME}
          fromOpacity={0.5}
          toOpacity={0.02}
          vertical
        />
        <filter id={`${uid}-pulse`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <Group left={margin.left} top={margin.top}>
        <GridRows scale={yScale} width={innerW} stroke={chrome.grid} strokeDasharray="3 5" numTicks={3} />
        <AreaClosed
          data={pts}
          x={(d) => xScale(d.i) ?? 0}
          y={(d) => yScale(d.aov) ?? 0}
          yScale={yScale}
          curve={curveMonotoneX}
          fill={`url(#${uid}-aov)`}
        />
        <LinePath
          data={pts}
          x={(d) => xScale(d.i) ?? 0}
          y={(d) => yScale(d.aov) ?? 0}
          curve={curveMonotoneX}
          stroke={CYAN}
          strokeWidth={3}
          filter={`url(#${uid}-pulse)`}
        />
        {scatter.map((s, i) => (
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={3.5}
            fill={chrome.aovScatterFill}
            opacity={0.85}
            stroke={CYAN}
            strokeWidth={1}
          />
        ))}
        <AxisLeft
          scale={yScale}
          tickValues={yScale.ticks(3)}
          stroke="transparent"
          tickStroke="transparent"
          tickLabelProps={() => ({
            fill: chrome.tick,
            fontSize: 10,
            textAnchor: "end",
            dx: -4,
            dy: 3,
          })}
        />
        <AxisBottom
          top={innerH}
          scale={xScale}
          tickValues={pts.filter((_, i) => i % Math.ceil(pts.length / 5) === 0).map((p) => p.i)}
          tickFormat={(i) => pts.find((p) => p.i === Number(i))?.label ?? ""}
          stroke={chrome.axisLine}
          tickStroke="transparent"
          tickLabelProps={() => ({
            fill: chrome.tick,
            fontSize: 10,
            textAnchor: "middle",
            dy: 8,
          })}
        />
      </Group>
    </svg>
  );
}

export function VisxPulseAovResponsive(props: {
  data: OBDSeries;
  currency: string;
  chartHeight?: number;
}) {
  const { chartHeight = 220, ...chartProps } = props;
  return (
    <ParentSize
      debounceTime={16}
      className="w-full"
      parentSizeStyles={{ width: "100%", height: chartHeight, flexShrink: 0 }}
    >
      {({ width, height }) =>
        width > 8 && height > 8 ? (
          <VisxPulseAovChart width={width} height={height} {...chartProps} />
        ) : null
      }
    </ParentSize>
  );
}

export function VisxScatterDemand({
  data,
  width,
  height,
}: {
  data: OBDSeries;
  width: number;
  height: number;
}) {
  const margin = { top: 12, right: 12, bottom: 28, left: 36 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const pts = useMemo(
    () =>
      data.map((d, i) => ({
        i,
        orders: d.orders ?? 0,
        completed: d.completed ?? 0,
        label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      })),
    [data],
  );

  const maxO = Math.max(1, ...pts.map((p) => p.orders));
  const maxC = Math.max(1, ...pts.map((p) => p.completed));

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxO],
        range: [0, innerW],
      }),
    [innerW, maxO],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, maxC],
        range: [innerH, 0],
      }),
    [innerH, maxC],
  );

  const chrome = useDashboardChartChrome();

  if (width < 40 || height < 40 || pts.length === 0) return null;

  return (
    <svg width={width} height={height}>
      <defs>
        <filter id="sc-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <Group left={margin.left} top={margin.top}>
        <GridRows scale={yScale} width={innerW} stroke={chrome.grid} strokeDasharray="2 4" numTicks={4} />
        <GridColumns scale={xScale} height={innerH} stroke={chrome.grid} strokeDasharray="2 4" numTicks={5} />
        {pts.map((p, idx) => {
          const cx = xScale(p.orders) ?? 0;
          const cy = yScale(p.completed) ?? 0;
          const jitter = ((idx * 7) % 5) * 0.8 - 1.6;
          return (
            <circle
              key={p.i}
              cx={cx + jitter}
              cy={cy}
              r={2.5 + (p.orders / maxO) * 2}
              fill={CYAN}
              opacity={0.35 + (p.completed / maxC) * 0.55}
              filter="url(#sc-glow)"
            />
          );
        })}
        <AxisLeft
          scale={yScale}
          numTicks={4}
          stroke="transparent"
          tickStroke="transparent"
          tickLabelProps={() => ({ fill: chrome.tick, fontSize: 9, dx: -4, dy: 3 })}
        />
        <AxisBottom
          top={innerH}
          scale={xScale}
          numTicks={4}
          stroke={chrome.axisLine}
          tickStroke="transparent"
          tickLabelProps={() => ({ fill: chrome.tick, fontSize: 9, dy: 8 })}
        />
      </Group>
      <text x={margin.left} y={height - 4} fill={chrome.tick} fontSize={9}>
        Orders (x) vs completed (y) · cyan scatter
      </text>
    </svg>
  );
}

export function VisxScatterDemandResponsive(props: {
  data: OBDSeries;
  /**
   * When true, fill the flex parent (e.g. demand hero). When false (default), use a fixed plot
   * height so dashboard grid rows do not stretch cards to match siblings.
   */
  fillParent?: boolean;
  chartHeight?: number;
}) {
  const { data, fillParent = false, chartHeight = 240 } = props;
  if (fillParent) {
    return (
      <ParentSize
        debounceTime={16}
        className="min-h-0 w-full flex-1"
        parentSizeStyles={{ width: "100%", height: "100%", minHeight: 0, flex: "1 1 0%" }}
      >
        {({ width, height }) =>
          width > 8 && height > 8 ? (
            <VisxScatterDemand width={width} height={height} data={data} />
          ) : null
        }
      </ParentSize>
    );
  }
  return (
    <ParentSize
      debounceTime={16}
      className="w-full"
      parentSizeStyles={{ width: "100%", height: chartHeight, flexShrink: 0 }}
    >
      {({ width, height }) =>
        width > 8 && height > 8 ? (
          <VisxScatterDemand width={width} height={height} data={data} />
        ) : null
      }
    </ParentSize>
  );
}

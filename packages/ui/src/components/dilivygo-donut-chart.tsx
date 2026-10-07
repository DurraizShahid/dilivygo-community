"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import {
  DILIVYGO_DONUT_FONT_STACK,
  dilivygoDonutSegmentLabelFontSize,
  layoutDilivygoDonutSegments,
  type DilivygoDonutGeomSegment,
} from "../lib/dilivygo-donut-geometry";

export type DilivygoDonutSegment = {
  key: string;
  value: number;
  color: string;
  /** Shown in native SVG tooltip */
  label?: string;
};

export type DilivygoDonutChartProps = {
  segments: DilivygoDonutSegment[];
  /** Viewbox width/height in px. */
  size?: number;
  /** Ring thickness: fraction of half-size (default 0.34). */
  thicknessRatio?: number;
  /** Gap between segment ends in degrees. */
  gapDegrees?: number;
  /** Arc midline radius as fraction of half-size (default 0.68). */
  radiusRatio?: number;
  /** Label radius = arc midline `r` × this scale (default `1` = centered on the colored ring). */
  labelRadiusScale?: number;
  className?: string;
  svgClassName?: string;
  /** Center stack (totals, captions). Absolutely centered over the hole. */
  center?: ReactNode;
  showSegmentPercentLabels?: boolean;
  minLabelPercent?: number;
  /** Describe the chart for assistive tech. */
  "aria-label"?: string;
};

const defaultSize = 164;

/**
 * Legend swatch — use `inline-block` so width/height apply (bare `span` + `size-*` can collapse in flex rows).
 */
export const DILIVYGO_DONUT_LEGEND_SWATCH_CLASSNAME =
  "inline-block size-2.5 shrink-0 rounded-full align-middle";

export function DilivygoDonutChart({
  segments,
  size = defaultSize,
  thicknessRatio = 0.34,
  gapDegrees = 3.25,
  radiusRatio = 0.68,
  labelRadiusScale = 1,
  className,
  svgClassName,
  center,
  showSegmentPercentLabels = true,
  minLabelPercent = 8,
  "aria-label": ariaLabel,
}: DilivygoDonutChartProps) {
  const { cx, cy, strokeWidth, r, geom } = layoutDilivygoDonutSegments({
    segments: segments.map(({ key, value, color }) => ({ key, value, color })),
    size,
    thicknessRatio,
    gapDegrees,
    radiusRatio,
    labelRadiusScale,
  });

  const labelFs = dilivygoDonutSegmentLabelFontSize(size);

  return (
    <div
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={cn("overflow-visible antialiased", svgClassName)}
        style={{
          fontFamily: DILIVYGO_DONUT_FONT_STACK,
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          className="stroke-muted-foreground/25"
          strokeWidth={strokeWidth}
        />
        {geom.map((g) => (
          <DonutArc key={g.key} g={g} strokeWidth={strokeWidth} segments={segments} />
        ))}
        {showSegmentPercentLabels &&
          geom
            .filter((g) => g.frac * 100 >= minLabelPercent)
            .map((g) => {
              const x = cx + g.labelR * Math.cos(g.midAngle);
              const y = cy + g.labelR * Math.sin(g.midAngle);
              return (
                <text
                  key={`lbl-${g.key}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={g.labelFill}
                  fontSize={labelFs}
                  fontWeight={600}
                  fontFamily={DILIVYGO_DONUT_FONT_STACK}
                  className="select-none"
                  style={{
                    pointerEvents: "none",
                    fontVariantNumeric: "lining-nums proportional-nums",
                    letterSpacing: "0.045em",
                  }}
                >
                  {g.pct}%
                </text>
              );
            })}
      </svg>
      {center != null ? (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 text-center antialiased"
          dir="ltr"
          style={{
            fontFamily: DILIVYGO_DONUT_FONT_STACK,
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          }}
        >
          {center}
        </div>
      ) : null}
    </div>
  );
}

function DonutArc({
  g,
  strokeWidth,
  segments,
}: {
  g: DilivygoDonutGeomSegment;
  strokeWidth: number;
  segments: DilivygoDonutSegment[];
}) {
  const meta = segments.find((s) => s.key === g.key);
  const tip =
    meta?.label != null
      ? `${meta.label}: ${g.value}${g.pct > 0 ? ` (${g.pct}%)` : ""}`
      : `${g.value}${g.pct > 0 ? ` (${g.pct}%)` : ""}`;
  return (
    <path
      d={g.d}
      fill="none"
      stroke={g.color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{tip}</title>
    </path>
  );
}

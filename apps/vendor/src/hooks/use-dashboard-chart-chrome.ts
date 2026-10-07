"use client";

import { useTheme } from "next-themes";
import { useMemo } from "react";

/** SVG / Visx chrome for logistics dashboards (light canvas vs dark shell). */
export type DashboardChartChrome = {
  isLight: boolean;
  grid: string;
  tick: string;
  cursorFill: string;
  cursorStroke: string;
  axisLine: string;
  axisXTick: string;
  axisOrdersTick: string;
  axisRevenueTick: string;
  heatCellStroke: string;
  halftoneOtherDot: string;
  halftoneOtherGround: string;
  peakBarGround: (intensity: number) => string;
  dualFloorStopColor: string;
  dualFloorStopOpacity100: number;
  mountainGradColor: string;
  mountainGradOpacities: [number, number, number, number, number, number];
  particleSparkle: string;
  particleRidgeStroke: string;
  particleRidgeStrokeLite: string;
  particleVertHighlight: string;
  trendVertStrokeLite: string;
  trendVertStrokeFull: string;
  trendSparkleSmall: string;
  trendSparkleTiny: string;
  gridDottedLine: (lineOpacity: number) => string;
  gridDottedCap: (capOpacity: number) => string;
  gridHaloFill: string;
  gridHaloFillDim: string;
  gridPinFill: string;
  gridPinFillDim: string;
  aovScatterFill: string;
  halftoneBarGround: string;
};

const DARK: Omit<DashboardChartChrome, "isLight" | "gridDottedLine" | "gridDottedCap"> & {
  gridDottedLine: (o: number) => string;
  gridDottedCap: (o: number) => string;
} = {
  grid: "rgba(255,255,255,0.06)",
  tick: "#9ca3af",
  cursorFill: "rgba(255,255,255,0.04)",
  cursorStroke: "rgba(255,255,255,0.08)",
  axisLine: "rgba(255,255,255,0.07)",
  axisXTick: "rgba(255,255,255,0.48)",
  axisOrdersTick: "rgba(255,164,128,0.72)",
  axisRevenueTick: "rgba(34,211,238,0.62)",
  heatCellStroke: "rgba(255,255,255,0.06)",
  halftoneOtherDot: "rgba(255,255,255,0.24)",
  halftoneOtherGround: "rgba(4,4,5,0.82)",
  peakBarGround: (intensity: number) => `rgba(4,8,6,${0.72 - intensity * 0.18})`,
  dualFloorStopColor: "#ffffff",
  dualFloorStopOpacity100: 0.035,
  mountainGradColor: "#ffffff",
  mountainGradOpacities: [0, 0.07, 0.28, 0.58, 0.88, 1],
  particleSparkle: "#ffffff",
  particleRidgeStroke: "rgba(255,255,255,0.28)",
  particleRidgeStrokeLite: "rgba(255,255,255,0.5)",
  particleVertHighlight: "#ffffff",
  trendVertStrokeLite: "rgba(255,255,255,0.5)",
  trendVertStrokeFull: "rgba(255,255,255,0.55)",
  trendSparkleSmall: "#ffffff",
  trendSparkleTiny: "#ffffff",
  gridDottedLine: (o: number) => `rgba(255,255,255,${o})`,
  gridDottedCap: (o: number) => `rgba(255,255,255,${o})`,
  gridHaloFill: "rgba(255,255,255,0.07)",
  gridHaloFillDim: "rgba(255,255,255,0.055)",
  gridPinFill: "rgba(255,255,255,0.62)",
  gridPinFillDim: "rgba(255,255,255,0.48)",
  aovScatterFill: "#ecfeff",
  halftoneBarGround: "rgba(4,4,5,0.82)",
};

const LIGHT_BASE = { r: 21, g: 32, b: 46 };

const LIGHT: Omit<DashboardChartChrome, "isLight" | "gridDottedLine" | "gridDottedCap"> & {
  gridDottedLine: (o: number) => string;
  gridDottedCap: (o: number) => string;
} = {
  grid: "rgba(21,32,46,0.09)",
  tick: "#3d5066",
  cursorFill: "rgba(21,32,46,0.06)",
  cursorStroke: "rgba(21,32,46,0.14)",
  axisLine: "rgba(21,32,46,0.14)",
  axisXTick: "rgba(61,80,102,0.95)",
  axisOrdersTick: "rgba(180,80,30,0.92)",
  axisRevenueTick: "rgba(8,120,140,0.9)",
  heatCellStroke: "rgba(21,32,46,0.08)",
  halftoneOtherDot: "rgba(21,32,46,0.2)",
  halftoneOtherGround: "rgba(226,234,243,0.92)",
  peakBarGround: (intensity: number) => {
    const a = 0.06 + (1 - intensity) * 0.14;
    return `rgba(${LIGHT_BASE.r},${LIGHT_BASE.g},${LIGHT_BASE.b},${a})`;
  },
  dualFloorStopColor: "#15202e",
  dualFloorStopOpacity100: 0.05,
  mountainGradColor: "#15202e",
  mountainGradOpacities: [0, 0.05, 0.12, 0.22, 0.34, 0.42],
  particleSparkle: "rgba(255,255,255,0.95)",
  particleRidgeStroke: "rgba(21,32,46,0.22)",
  particleRidgeStrokeLite: "rgba(21,32,46,0.35)",
  particleVertHighlight: "rgba(255,255,255,0.9)",
  trendVertStrokeLite: "rgba(21,32,46,0.4)",
  trendVertStrokeFull: "rgba(21,32,46,0.45)",
  trendSparkleSmall: "rgba(255,255,255,0.95)",
  trendSparkleTiny: "rgba(255,255,255,0.98)",
  gridDottedLine: (o: number) => `rgba(${LIGHT_BASE.r},${LIGHT_BASE.g},${LIGHT_BASE.b},${o})`,
  gridDottedCap: (o: number) => `rgba(${LIGHT_BASE.r},${LIGHT_BASE.g},${LIGHT_BASE.b},${o * 0.9})`,
  gridHaloFill: "rgba(21,32,46,0.09)",
  gridHaloFillDim: "rgba(21,32,46,0.07)",
  gridPinFill: "rgba(21,32,46,0.5)",
  gridPinFillDim: "rgba(21,32,46,0.38)",
  aovScatterFill: "#f0f7ff",
  halftoneBarGround: "rgba(255,255,255,0.9)",
};

export function useDashboardChartChrome(): DashboardChartChrome {
  const { resolvedTheme } = useTheme();
  return useMemo(() => {
    const isLight = resolvedTheme === "light";
    const base = isLight ? LIGHT : DARK;
    return { isLight, ...base };
  }, [resolvedTheme]);
}

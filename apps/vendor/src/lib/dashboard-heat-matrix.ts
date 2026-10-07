import type { PeakHourPoint, TimeSeriesPoint } from "@dilivygo/types";

export const HEAT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function mondayIndexFromDateKey(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const sun0 = d.getUTCDay();
  return (sun0 + 6) % 7;
}

export function buildHeatMatrix(
  ordersByDay: TimeSeriesPoint[],
  peakHours: PeakHourPoint[],
): number[][] {
  const rows = Array.from({ length: 7 }, () => Array.from({ length: 12 }, () => 0));
  const hourWeights = new Map<number, number>();
  let totalW = 0;
  for (const h of peakHours || []) {
    const hr = Number.parseInt(String(h.hour), 10);
    if (Number.isNaN(hr) || hr < 0 || hr > 23) continue;
    const v = h.orders ?? 0;
    hourWeights.set(hr, (hourWeights.get(hr) || 0) + v);
    totalW += v;
  }
  if (totalW < 1) totalW = 1;
  for (const day of ordersByDay || []) {
    const wd = mondayIndexFromDateKey(day.date);
    const o = day.orders ?? 0;
    for (let c = 0; c < 12; c++) {
      let slice = 0;
      for (let hr = c * 2; hr < c * 2 + 2; hr++) {
        slice += hourWeights.get(hr) ?? 0;
      }
      const w = slice / totalW || 1 / 12;
      rows[wd][c] += o * w;
    }
  }
  return rows;
}

export function matrixStats(matrix: number[][]): { min: number; avg: number; max: number } {
  const flat = matrix.flat().filter((n) => n > 0);
  if (!flat.length) return { min: 0, avg: 0, max: 0 };
  const min = Math.min(...flat);
  const max = Math.max(...flat);
  const avg = flat.reduce((a, b) => a + b, 0) / flat.length;
  return { min: Math.round(min), avg: Math.round(avg), max: Math.round(max) };
}

export function heatCellRgba(t: number, max: number, light = false): string {
  if (max < 1) return light ? "rgba(235,94,40,0.14)" : "rgba(235,94,40,0.12)";
  const x = Math.min(1, t / max);
  const r = Math.round(45 + x * (235 - 45));
  const g = Math.round(28 + x * (94 - 28));
  const b = Math.round(22 + x * (40 - 22));
  const base = light ? 0.2 : 0.35;
  const span = light ? 0.5 : 0.55;
  return `rgba(${r},${g},${b},${base + x * span})`;
}

/** Canonical Dilivygo analytics / dashboard accent colors (aligned with superadmin charts). */
export const DILIVYGO_CHART_PEACH = "#EB5E28";
export const DILIVYGO_CHART_SKY = "#60a5fa";
export const DILIVYGO_CHART_LIME = "#1C7C54";
export const DILIVYGO_CHART_VIOLET = "#a78bfa";
export const DILIVYGO_CHART_CYAN = "#22d3ee";
export const DILIVYGO_CHART_AMBER = "#C1DF1F";
export const DILIVYGO_CHART_ROSE = "#CA054D";

/** Cycle for generic multi-series pies (status mix, etc.). */
export const DILIVYGO_CHART_PALETTE = [
  DILIVYGO_CHART_PEACH,
  DILIVYGO_CHART_LIME,
  DILIVYGO_CHART_CYAN,
  DILIVYGO_CHART_SKY,
  DILIVYGO_CHART_AMBER,
  DILIVYGO_CHART_ROSE,
  DILIVYGO_CHART_VIOLET,
] as const;

export function dilivygoChartColorAt(index: number): string {
  return DILIVYGO_CHART_PALETTE[index % DILIVYGO_CHART_PALETTE.length]!;
}

/**
 * Tenant-aware branded chart palette — Phase 11.
 * Uses effectiveTheme (from DynamicThemeProvider) to derive a deterministic,
 * perceptually distinct palette. First color relates to brand primary; others
 * remain distinct and readable on the theme background. Monochrome brands get
 * forced diversity. Semantic status colors (destructive/success/warning) are
 * never replaced.
 *
 * For superadmin/operator charts, keep using the canonical DILIVYGO_CHART_PALETTE.
 * For tenant-facing generic charts, call this with the current theme.
 */
export function deriveChartPalette(
  effectiveTheme: Record<string, string> | null | undefined,
  options?: { count?: number; isDark?: boolean },
): string[] {
  if (!effectiveTheme || !effectiveTheme.primary) return [...DILIVYGO_CHART_PALETTE];
  try {
    // Prefer the workspace package import; fall back to the relative path for
    // ad-hoc consumers that haven't installed the dependency yet.
    let derive: ((theme: Record<string, string>, opts?: { count?: number; background?: string }) => string[]) | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      derive = require("@dilivygo/theme-engine").deriveChartPalette ?? null;
    } catch {
      derive = null;
    }
    if (!derive) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      derive = require("../../../theme-engine/src/chart.js").deriveChartPalette;
    }
    if (!derive) return [...DILIVYGO_CHART_PALETTE];
    const bg = options?.isDark ? effectiveTheme.background || "#0f172a" : effectiveTheme.background || "#ffffff";
    return derive(effectiveTheme as Record<string, string>, { count: options?.count, background: bg });
  } catch {
    return [...DILIVYGO_CHART_PALETTE];
  }
}

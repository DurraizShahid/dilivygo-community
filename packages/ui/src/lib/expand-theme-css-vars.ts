import type { ThemeColors } from "@dilivygo/types";
import {
  PLATFORM_THEME_FIELD_META,
  PLATFORM_THEME_FIELD_KEYS_SKIP_WEB_CSS,
} from "@dilivygo/types";

/** Maps persisted `ThemeColors` keys to shadcn-style CSS custom properties. */
export const THEME_COLORS_TO_CSS_VAR: Record<keyof ThemeColors, string> = Object.fromEntries(
  PLATFORM_THEME_FIELD_META.map((m) => [m.key, m.cssVar]),
) as Record<keyof ThemeColors, string>;

/**
 * Keys persisted on `platform_theme` but not applied as CSS variables on web.
 * Derived from canonical contract (`webCssInjection: false`) — currently only
 * `border`. HISTORICAL REGRESSION: `border` often equaled `primary`, tinting
 * every `border-border` hairline across dashboard shells — so it is kept
 * stored+validated but not injected.
 * Single source: `PLATFORM_THEME_FIELD_KEYS_SKIP_WEB_CSS` in `@dilivygo/types`.
 */
const THEME_COLOR_KEYS_SKIP_WEB_CSS: readonly (keyof ThemeColors)[] =
  PLATFORM_THEME_FIELD_KEYS_SKIP_WEB_CSS as readonly (keyof ThemeColors)[];

function themeColorEntriesForWebCss(): [keyof ThemeColors, string][] {
  return (Object.entries(THEME_COLORS_TO_CSS_VAR) as [keyof ThemeColors, string][]).filter(
    ([key]) => !THEME_COLOR_KEYS_SKIP_WEB_CSS.includes(key),
  );
}

function sanitizeCssColorValue(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  if (/^#[0-9a-f]{3,4}$/i.test(v)) return v;
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{8}$/i.test(v)) return v;
  if (/^rgb\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
  if (/^rgba\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
  if (/^hsl\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
  if (/^hsla\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
  if (/^oklch\(\s*[0-9\s./%]+\s*\)$/i.test(v)) return v;
  if (/^oklab\(\s*[0-9\s./%]+\s*\)$/i.test(v)) return v;
  if (/^var\(--[a-z0-9-_]+\)$/i.test(v)) return v;
  if (/^(transparent|currentColor)$/i.test(v)) return v;
  return null;
}

/** Token map for the pre-hydration blocking script (omit skipped keys). */
export function themeColorsToCssVarMapForWebInjection(): Record<string, string> {
  return Object.fromEntries(themeColorEntriesForWebCss()) as Record<string, string>;
}

/**
 * Build `prop: value;` pairs for injection. When `primary` / `primaryForeground` are set, also maps them to
 * `--ring`, `--sidebar-primary`, `--sidebar-ring`, `--chart-1..--chart-6`, and `--sidebar-primary-foreground`
 * so logistics dashboards and tenant charts pick up brand changes without separate token fields.
 * Chart colors 2..6 are derived deterministically from the effective theme via
 * `@dilivygo/theme-engine` chart palette (brand-related, distinct, readable).
 * Semantic status colors are never overwritten here — charts that encode
 * success/warning/error keep their explicit tokens.
 */
export function collectThemeCssDeclarations(colors: ThemeColors): string[] {
  const decls: string[] = [];
  for (const [key, cssVar] of themeColorEntriesForWebCss()) {
    const v = sanitizeCssColorValue(colors[key]);
    if (v) decls.push(`${cssVar}: ${v};`);
  }
  const p = sanitizeCssColorValue(colors.primary);
  const pf = sanitizeCssColorValue(colors.primaryForeground);
  if (p) {
    decls.push(`--ring: ${p};`, `--sidebar-primary: ${p};`, `--sidebar-ring: ${p};`, `--chart-1: ${p};`);
    // Derive --chart-2..--chart-6 from the effective theme (brand-related).
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { deriveChartPalette } = require("../../../theme-engine/src/chart.js") as {
        deriveChartPalette: (theme: Record<string, string>, opts?: { count?: number; background?: string }) => string[];
      };
      const bg = sanitizeCssColorValue((colors as Record<string, string>).background) || "#ffffff";
      const palette = deriveChartPalette(colors as unknown as Record<string, string>, { count: 6, background: bg });
      for (let i = 1; i < palette.length; i++) {
        const c = sanitizeCssColorValue(palette[i]);
        if (c) decls.push(`--chart-${i + 1}: ${c};`);
      }
    } catch {
      // Chart derivation is best-effort — core tokens above still apply.
    }
  }
  if (pf) {
    decls.push(`--sidebar-primary-foreground: ${pf};`);
  }
  return decls;
}

export function buildThemeCssBlock(colors: ThemeColors, selector: string): string {
  const decls = collectThemeCssDeclarations(colors);
  if (decls.length === 0) return "";
  return `${selector} { ${decls.join(" ")} }`;
}

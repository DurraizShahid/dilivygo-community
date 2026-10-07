/**
 * Shared runtime surface policy — TypeScript mirror of surface-policy.js.
 * Single source of truth for preview + runtime effective tokens.
 */

export const DARK_PAGE_BACKGROUND = "#09090B";
export const DARK_SURFACE_BACKGROUND = "#18181B";

export const FIXED_DARK_SHELL = {
  background: DARK_PAGE_BACKGROUND,
  secondary: DARK_SURFACE_BACKGROUND,
  muted: DARK_SURFACE_BACKGROUND,
  accent: DARK_SURFACE_BACKGROUND,
} as const;

export type ThemeSurface =
  | "customer_web"
  | "rider_web"
  | "vendor_web"
  | "pos_web"
  | "saas_web"
  | "superadmin_web"
  | "customer_mobile"
  | "vendor_mobile"
  | "rider_mobile";

export interface ThemePair {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export function applyRuntimeThemePolicy(
  theme: ThemePair,
  surface: string,
  mode: "light" | "dark",
): Record<string, string> {
  const light = { ...(theme?.light ?? {}) };
  const dark = { ...(theme?.dark ?? {}) };
  const s = String(surface || "").toLowerCase();
  const m = mode === "dark" ? "dark" : "light";
  if ((s === "vendor_web" || s === "vendor_mobile" || s === "pos_web" || s === "superadmin_web") && m === "dark") {
    return {
      ...dark,
      background: DARK_PAGE_BACKGROUND,
      secondary: DARK_SURFACE_BACKGROUND,
      muted: DARK_SURFACE_BACKGROUND,
      accent: DARK_SURFACE_BACKGROUND,
    };
  }
  return m === "dark" ? { ...dark } : { ...light };
}

export function effectiveTokensForSurface(
  resolvedTheme: ThemePair,
  surface: string,
  mode: "light" | "dark",
): Record<string, string> {
  return applyRuntimeThemePolicy(resolvedTheme, surface, mode);
}

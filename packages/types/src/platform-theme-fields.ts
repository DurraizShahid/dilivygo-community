/** Canonical theme contract — single source of truth for every surface.
 *
 * This file drives:
 *   - SaaS editor (Theme Colors / Brand Studio)
 *   - Server validation (`platform-theme.js` THEME_COLOR_KEYS parity)
 *   - CSS injection (`expand-theme-css-vars.ts`)
 *   - Generator + quality checks (future `packages/theme-engine`)
 *   - Mobile merge (`merge-platform-theme-colors`)
 *
 * Rules:
 *   - `PLATFORM_THEME_FIELD_META` is the authoritative row list. All other exports
 *     derive from it so drift is impossible within this package.
 *   - Server `THEME_COLOR_KEYS` must match `PLATFORM_THEME_FIELD_KEYS` (enforced by
 *     `apps/server/tests/theme-contract.test.js` parity test — no build cycle).
 *   - Adding a new token requires: this file → server parity test green → Zod schema
 *     update → CSS var mapping → mobile merge (already key-agnostic) → preset coverage.
 */

export type PlatformThemeColorKey =
  | "primary"
  | "primaryForeground"
  | "secondary"
  | "secondaryForeground"
  | "accent"
  | "accentForeground"
  | "background"
  | "foreground"
  | "muted"
  | "mutedForeground"
  | "destructive"
  | "card"
  | "cardForeground"
  | "border";

export type ThemeFieldGroup = "brand" | "surface" | "text" | "semantic";
export type ThemeFieldAppliesTo = "both" | "light" | "dark";

export interface PlatformThemeFieldMeta {
  /** Stable token id — matches `ThemeColors` key and every consumer. */
  key: PlatformThemeColorKey;
  /** Human label for editors. */
  label: string;
  /** Editor grouping. */
  group: ThemeFieldGroup;
  /** Short description for tooltips / docs. */
  description: string;
  /** Which mode(s) the token meaningfully applies to. */
  appliesTo: ThemeFieldAppliesTo;
  /** Foreground token that pairs with this background/surface, if any. */
  foregroundPartner: PlatformThemeColorKey | null;
  /** Background/surface token that pairs with this foreground, if any. */
  backgroundPartner: PlatformThemeColorKey | null;
  /** Whether deterministic generator is expected to produce this token. */
  generated: boolean;
  /** Whether Advanced editor exposes this token for manual editing. */
  editable: boolean;
  /** CSS custom property name. */
  cssVar: string;
  /** Whether web `DynamicThemeProvider` injects this as a CSS var (false = stored but not rendered). */
  webCssInjection: boolean;
  /** Human-readable constraints / historical notes (surface-specific). */
  constraints: string[];
}

/**
 * Authoritative 14-token contract. Order is the iteration order for presets,
 * CSS injection, and editor rendering. Do not reorder without updating
 * snapshot/parity tests.
 */
export const PLATFORM_THEME_FIELD_META: readonly PlatformThemeFieldMeta[] = [
  {
    key: "primary",
    label: "Primary",
    group: "brand",
    description: "Main brand color — CTAs, active states, links",
    appliesTo: "both",
    foregroundPartner: "primaryForeground",
    backgroundPartner: null,
    generated: true,
    editable: true,
    cssVar: "--primary",
    webCssInjection: true,
    constraints: ["also maps to --ring, --sidebar-primary, --sidebar-ring, --chart-1"],
  },
  {
    key: "primaryForeground",
    label: "Primary foreground",
    group: "brand",
    description: "Text/icon on primary background — must contrast with primary",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: "primary",
    generated: true,
    editable: true,
    cssVar: "--primary-foreground",
    webCssInjection: true,
    constraints: ["also maps to --sidebar-primary-foreground"],
  },
  {
    key: "secondary",
    label: "Secondary",
    group: "brand",
    description: "Supporting brand surface — secondary buttons, chips",
    appliesTo: "both",
    foregroundPartner: "secondaryForeground",
    backgroundPartner: null,
    generated: true,
    editable: true,
    cssVar: "--secondary",
    webCssInjection: true,
    constraints: [
      "dark logistics shell: fixed to #18181B in DynamicThemeProvider blocking script + injectTheme (POS/Vendor/Superadmin dashboards) — tenant value not visible on web dark",
    ],
  },
  {
    key: "secondaryForeground",
    label: "Secondary foreground",
    group: "brand",
    description: "Text on secondary background",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: "secondary",
    generated: true,
    editable: true,
    cssVar: "--secondary-foreground",
    webCssInjection: true,
    constraints: [],
  },
  {
    key: "accent",
    label: "Accent",
    group: "brand",
    description: "Tertiary highlight — hovers, selections, subtle brand wash",
    appliesTo: "both",
    foregroundPartner: "accentForeground",
    backgroundPartner: null,
    generated: true,
    editable: true,
    cssVar: "--accent",
    webCssInjection: true,
    constraints: [
      "dark logistics shell: fixed to #18181B on web (same as secondary/muted)",
    ],
  },
  {
    key: "accentForeground",
    label: "Accent foreground",
    group: "brand",
    description: "Text on accent background",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: "accent",
    generated: true,
    editable: true,
    cssVar: "--accent-foreground",
    webCssInjection: true,
    constraints: [],
  },
  {
    key: "background",
    label: "Background",
    group: "surface",
    description: "Page canvas",
    appliesTo: "both",
    foregroundPartner: "foreground",
    backgroundPartner: null,
    generated: true,
    editable: true,
    cssVar: "--background",
    webCssInjection: true,
    constraints: [
      "dark logistics shell: fixed to #09090B on web — tenant dark background not visible in Vendor/Superadmin/POS",
      "customer-facing dark: tenant background IS respected when not in logistics shell (future generator will produce intentional dark)",
    ],
  },
  {
    key: "foreground",
    label: "Foreground",
    group: "text",
    description: "Primary text on background",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: "background",
    generated: true,
    editable: true,
    cssVar: "--foreground",
    webCssInjection: true,
    constraints: [],
  },
  {
    key: "muted",
    label: "Muted",
    group: "surface",
    description: "Subtle surface — skeletons, disabled fills",
    appliesTo: "both",
    foregroundPartner: "mutedForeground",
    backgroundPartner: null,
    generated: true,
    editable: true,
    cssVar: "--muted",
    webCssInjection: true,
    constraints: [
      "dark logistics shell: fixed to #18181B on web",
    ],
  },
  {
    key: "mutedForeground",
    label: "Muted foreground",
    group: "text",
    description: "Text on muted surface",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: "muted",
    generated: true,
    editable: true,
    cssVar: "--muted-foreground",
    webCssInjection: true,
    constraints: [],
  },
  {
    key: "destructive",
    label: "Destructive",
    group: "semantic",
    description: "Error / delete actions — semantic, not brand-recolored",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: null,
    generated: false,
    editable: true,
    cssVar: "--destructive",
    webCssInjection: true,
    constraints: [
      "semantic: generator must not recolor destructive to match brand hue",
      "no paired foreground token — uses foreground/background contrast as fallback",
    ],
  },
  {
    key: "card",
    label: "Card",
    group: "surface",
    description: "Card / popover surface",
    appliesTo: "both",
    foregroundPartner: "cardForeground",
    backgroundPartner: null,
    generated: true,
    editable: true,
    cssVar: "--card",
    webCssInjection: true,
    constraints: [],
  },
  {
    key: "cardForeground",
    label: "Card foreground",
    group: "text",
    description: "Text on card surface",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: "card",
    generated: true,
    editable: true,
    cssVar: "--card-foreground",
    webCssInjection: true,
    constraints: [],
  },
  {
    key: "border",
    label: "Border",
    group: "surface",
    description: "Hairline separators — low-chroma neutral",
    appliesTo: "both",
    foregroundPartner: null,
    backgroundPartner: null,
    generated: true,
    editable: true,
    cssVar: "--border",
    webCssInjection: false,
    constraints: [
      "webCssInjection: false — HISTORICAL REGRESSION: border often equaled primary, which tinted every border-border hairline across dashboard shells",
      "persisted + validated but NOT injected as --border on web (expand-theme-css-vars.ts THEME_COLOR_KEYS_SKIP_WEB_CSS)",
      "future: either safely support with low-chroma guard or keep constrained — do not misleadingly show as global border tint",
    ],
  },
] as const;

/** Back-compat: key+label rows (prefer PLATFORM_THEME_FIELD_META). */
export const PLATFORM_THEME_FIELD_ROWS: readonly { key: PlatformThemeColorKey; label: string }[] =
  PLATFORM_THEME_FIELD_META.map(({ key, label }) => ({ key, label }));

/** Keys in canonical order (for iteration without labels). */
export const PLATFORM_THEME_FIELD_KEYS: readonly PlatformThemeColorKey[] =
  PLATFORM_THEME_FIELD_META.map((r) => r.key);

/** Keys skipped from web CSS injection — derived from meta (do not hardcode elsewhere). */
export const PLATFORM_THEME_FIELD_KEYS_SKIP_WEB_CSS: readonly PlatformThemeColorKey[] =
  PLATFORM_THEME_FIELD_META.filter((r) => !r.webCssInjection).map((r) => r.key);

/** Dark-mode fixed-shell overrides (logistics/POS) — tenant values for these keys are replaced with constants on web dark. */
export const DARK_FIXED_SHELL_KEYS = [
  "background",
  "secondary",
  "muted",
  "accent",
] as const satisfies readonly PlatformThemeColorKey[];
export const DARK_FIXED_SHELL_VALUES: Readonly<Record<(typeof DARK_FIXED_SHELL_KEYS)[number], string>> = {
  background: "#09090B",
  secondary: "#18181B",
  muted: "#18181B",
  accent: "#18181B",
} as const;

/** Helpers for validation / editor wiring */
export function fieldMetaFor(key: PlatformThemeColorKey): PlatformThemeFieldMeta | undefined {
  return PLATFORM_THEME_FIELD_META.find((r) => r.key === key);
}
export function foregroundPartnerFor(key: PlatformThemeColorKey): PlatformThemeColorKey | null {
  return fieldMetaFor(key)?.foregroundPartner ?? null;
}
export function backgroundPartnerFor(key: PlatformThemeColorKey): PlatformThemeColorKey | null {
  return fieldMetaFor(key)?.backgroundPartner ?? null;
}
export function isGeneratedField(key: PlatformThemeColorKey): boolean {
  return fieldMetaFor(key)?.generated ?? false;
}
export function isWebCssInjectedField(key: PlatformThemeColorKey): boolean {
  return fieldMetaFor(key)?.webCssInjection ?? false;
}

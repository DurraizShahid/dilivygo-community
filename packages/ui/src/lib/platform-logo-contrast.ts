/**
 * When the platform has no custom `logoUrl` / `wordmarkUrl`, packaged SVGs from `@dilivygo/logos` are used.
 * - `auto` follows the active UI theme (next-themes): light chrome → dark ink, dark chrome → light ink.
 * - `forLightBackground` / `forDarkBackground` pin the asset regardless of theme (e.g. hero on a tinted card).
 */
export type PlatformLogoContrast = "auto" | "forLightBackground" | "forDarkBackground";

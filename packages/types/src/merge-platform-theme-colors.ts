import { PLATFORM_THEME_FIELD_KEYS, type PlatformThemeColorKey } from "./platform-theme-fields";

/**
 * Overlay server `ThemeColors` onto a native app palette (same camelCase keys).
 * Leaves unrelated keys (e.g. success, warning) unchanged.
 */
export function mergePlatformThemeColors<T extends Record<string, string>>(
  base: T,
  platform: Partial<Record<PlatformThemeColorKey, string | undefined>> | undefined | null,
): T {
  if (!platform) return { ...base };
  const out = { ...base } as T;
  const rec = out as Record<string, string>;
  for (const k of PLATFORM_THEME_FIELD_KEYS) {
    const v = platform[k];
    if (typeof v === "string" && v.trim() !== "") rec[k as string] = v.trim();
  }
  return out;
}

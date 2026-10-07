"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  DEFAULT_PLATFORM_LOGO_MARK_FOR_DARK_UI,
  DEFAULT_PLATFORM_LOGO_MARK_FOR_LIGHT_UI,
} from "../lib/default-platform-branding-assets";
import type { PlatformLogoContrast } from "../lib/platform-logo-contrast";
import { cn } from "../lib/utils";
import { usePlatformBranding } from "../providers/dynamic-theme-provider";

type PlatformBrandingMarkProps = {
  className?: string;
  imgClassName?: string;
  /**
   * When no custom platform logo URL is set, chooses the packaged mark for light vs dark surfaces.
   * Default follows the active UI theme.
   */
  contrast?: PlatformLogoContrast;
};

function defaultMarkSrc(contrast: PlatformLogoContrast, resolvedTheme: string | undefined): string {
  if (contrast === "forLightBackground") return DEFAULT_PLATFORM_LOGO_MARK_FOR_LIGHT_UI;
  if (contrast === "forDarkBackground") return DEFAULT_PLATFORM_LOGO_MARK_FOR_DARK_UI;
  const uiDark = resolvedTheme === "dark";
  return uiDark ? DEFAULT_PLATFORM_LOGO_MARK_FOR_DARK_UI : DEFAULT_PLATFORM_LOGO_MARK_FOR_LIGHT_UI;
}

/**
 * Renders the platform logo image when set, otherwise packaged logos from `@dilivygo/logos` (by theme),
 * otherwise the first letter of the app name if those assets are unavailable.
 * Must be used inside DynamicThemeProvider.
 */
export function PlatformBrandingMark({
  className,
  imgClassName,
  contrast = "auto",
}: PlatformBrandingMarkProps) {
  const { appName, logoUrl } = usePlatformBranding();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const initial = appName.trim().charAt(0).toUpperCase() || "D";

  /** Avoid hydration mismatch: SSR + first client paint must not depend on `resolvedTheme` when contrast is `auto`. */
  const themeForFallback =
    contrast === "auto" && !mounted ? undefined : resolvedTheme;

  if (logoUrl) {
    return (
      <span
        className={cn("relative flex shrink-0 items-center justify-center overflow-hidden", className)}
      >
        <img
          src={logoUrl}
          alt=""
          className={cn(
            "size-full min-h-full min-w-full object-cover object-center",
            imgClassName,
          )}
        />
      </span>
    );
  }

  const fallbackSrc = defaultMarkSrc(contrast, themeForFallback);
  if (fallbackSrc) {
    return (
      <span
        className={cn("relative flex shrink-0 items-center justify-center overflow-hidden", className)}
      >
        <img
          src={fallbackSrc}
          alt=""
          className={cn(
            "size-full min-h-full min-w-full object-contain object-center",
            imgClassName,
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center font-bold text-primary-foreground",
        className,
      )}
    >
      {initial}
    </span>
  );
}

"use client";

import type { PlatformLogoContrast } from "../lib/platform-logo-contrast";
import { cn } from "../lib/utils";
import { usePlatformBranding } from "../providers/dynamic-theme-provider";

type PlatformWordmarkProps = {
  className?: string;
  imgClassName?: string;
  children: React.ReactNode;
  /**
   * When no custom platform wordmark URL is set, renders children (e.g. app name text).
   */
  contrast?: PlatformLogoContrast;
};

export function PlatformWordmark({
  className,
  imgClassName,
  children,
}: PlatformWordmarkProps) {
  const { wordmarkUrl } = usePlatformBranding();

  if (wordmarkUrl) {
    return (
      <span
        className={cn(
          "inline-flex max-w-[200px] items-center sm:max-w-[280px]",
          className,
        )}
      >
        <img
          src={wordmarkUrl}
          alt=""
          className={cn(
            "h-7 w-auto max-w-full object-contain object-left sm:h-8",
            imgClassName,
          )}
        />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex max-w-[200px] items-center sm:max-w-[280px]", className)}>
      {children}
    </span>
  );
}

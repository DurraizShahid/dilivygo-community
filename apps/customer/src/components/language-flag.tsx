"use client";

import ReactCountryFlag from "react-country-flag";
import { cn } from "@dilivygo/ui";

export function LanguageFlag({
  countryCode,
  label,
  className,
  sizePx = 20,
}: {
  countryCode: string;
  label: string;
  className?: string;
  sizePx?: number;
}) {
  const s = `${sizePx}px`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 overflow-hidden rounded-md border border-border/50 bg-muted/20 shadow-sm",
        className
      )}
      style={{ width: s, height: s }}
    >
      <ReactCountryFlag
        countryCode={countryCode}
        svg
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        title={label}
        aria-label={label}
      />
    </span>
  );
}

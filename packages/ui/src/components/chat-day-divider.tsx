"use client";

import { cn } from "../lib/utils";

export function ChatDayDivider({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  if (!label) return null;
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-2",
        className
      )}
      role="separator"
    >
      <div className="h-px flex-1 bg-border/60" />
      <span className="shrink-0 rounded-full bg-muted/80 px-3 py-0.5 text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border/60" />
    </div>
  );
}

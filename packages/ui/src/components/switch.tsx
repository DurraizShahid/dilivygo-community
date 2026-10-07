"use client";

import { cn } from "../lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  id?: string;
}

const sizes = {
  sm: { track: "h-5 w-9", thumb: "size-3.5", translate: "translate-x-4" },
  md: { track: "h-6 w-11", thumb: "size-4.5", translate: "translate-x-5" },
  lg: { track: "h-7 w-[52px]", thumb: "size-5.5", translate: "translate-x-6" },
};

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  size = "md",
  className,
  id,
}: SwitchProps) {
  const s = sizes[size];

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted",
        s.track,
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none rounded-full bg-background shadow-lg ring-0 transition-transform duration-200",
          checked ? s.translate : "translate-x-0",
          s.thumb,
        )}
      />
    </button>
  );
}

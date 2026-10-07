"use client";

import type { HTMLAttributes } from "react";
import { cn } from "../lib/utils";

type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
};

function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  return (
    <div
      role="separator"
      data-slot="separator"
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className
      )}
      {...props}
    />
  );
}

export { Separator };

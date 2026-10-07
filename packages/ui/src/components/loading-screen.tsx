"use client";

import { cn } from "../lib/utils";
import { DotFlow } from "./dot-flow";

export function LoadingScreen({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-[50vh] items-center justify-center",
        className
      )}
    >
      <DotFlow />
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface ChatPeerTypingBarProps {
  /** Shown next to the animated dots, e.g. "Someone is typing…" */
  label: string;
  className?: string;
}

export function ChatPeerTypingBar({ label, className }: ChatPeerTypingBarProps) {
  return (
    <div
      className={cn(
        "flex min-h-9 items-center gap-2 border-t border-border/40 bg-muted/25 px-4 py-2 text-xs text-muted-foreground",
        className
      )}
      role="status"
      aria-live="polite"
      aria-relevant="additions"
    >
      <span className="flex gap-1 pt-0.5" aria-hidden>
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/55 [animation-delay:-0.2s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/55 [animation-delay:-0.1s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/55" />
      </span>
      <span className="font-medium tracking-tight">{label}</span>
    </div>
  );
}

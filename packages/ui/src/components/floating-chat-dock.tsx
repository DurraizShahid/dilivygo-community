"use client";

import * as React from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export type FloatingDockChatItem = { id: string; title: string };

export interface FloatingChatDockProps {
  items: FloatingDockChatItem[];
  activeId: string | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onActiveChange: (id: string | null) => void;
  onRemoveItem: (id: string) => void;
  /** Full iframe URL for a conversation id */
  iframeSrcFor: (conversationId: string) => string;
  /** Dock button / panel title */
  label: string;
  /** Merged onto the fixed root (e.g. offset when a persistent left rail is present). */
  className?: string;
}

export function FloatingChatDock({
  items,
  activeId,
  expanded,
  onExpandedChange,
  onActiveChange,
  onRemoveItem,
  iframeSrcFor,
  label,
  className,
}: FloatingChatDockProps) {
  const [dockTabsRef] = useAutoAnimate<HTMLDivElement>();
  const active = items.find((i) => i.id === activeId) ?? items[0] ?? null;
  const iframeSrc = active ? iframeSrcFor(active.id) : "";

  if (items.length === 0) return null;

  return (
    <div
      ref={dockTabsRef}
      className={cn(
        "fixed z-[100] flex flex-col items-start gap-0",
        "bottom-0 left-4 max-w-[calc(100vw-2rem)] sm:left-6",
        "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      {expanded && active ? (
        <div
          className={cn(
            "mb-1 flex w-[min(100vw-2rem,440px)] flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl",
            "ring-1 ring-black/5 dark:ring-white/10"
          )}
        >
          <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-3 py-2">
            <span className="truncate text-sm font-semibold tracking-tight">{active.title}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-lg"
              aria-label="Minimize chat panel"
              onClick={() => onExpandedChange(false)}
            >
              <ChevronDown className="size-4" />
            </Button>
          </div>
          <iframe
            title={active.title}
            src={iframeSrc}
            className="h-[min(70vh,520px)] w-full border-0 bg-background"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
          />
        </div>
      ) : null}

      <div
        className={cn(
          "flex max-w-full items-end gap-1 rounded-2xl border border-border/60 bg-card/95 p-1.5 shadow-lg backdrop-blur-md",
          "ring-1 ring-black/5 dark:ring-white/10"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1.5 rounded-xl px-2.5 text-xs font-semibold"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronUp className="size-3.5" />
          )}
          <span className="max-sm:hidden">{label}</span>
          <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
            {items.length}
          </span>
        </Button>

        <div
          ref={dockTabsRef}
          className="flex max-w-[min(100vw-11rem,280px)] gap-1 overflow-x-auto"
        >
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <div
                key={item.id}
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded-xl border px-1 py-0.5",
                  isActive && expanded
                    ? "border-primary/40 bg-primary/10"
                    : "border-transparent bg-muted/50"
                )}
              >
                <button
                  type="button"
                  className="max-w-[120px] truncate px-2 py-1 text-left text-xs font-medium transition-colors hover:text-primary"
                  onClick={() => {
                    onActiveChange(item.id);
                    onExpandedChange(true);
                  }}
                >
                  {item.title}
                </button>
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  aria-label={`Remove ${item.title} from dock`}
                  onClick={() => onRemoveItem(item.id)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

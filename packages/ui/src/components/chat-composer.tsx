"use client";

import * as React from "react";
import { Send, Loader2, MessageSquareText } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  className?: string;
}

const MAX_TA_HEIGHT_PX = 160;

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  sending,
  placeholder = "Message…",
  className,
}: ChatComposerProps) {
  const taRef = React.useRef<HTMLTextAreaElement>(null);

  const resize = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TA_HEIGHT_PX)}px`;
  }, []);

  React.useLayoutEffect(() => {
    resize();
  }, [value, resize]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !sending && value.trim()) onSubmit();
    }
  }

  const canSend = value.trim().length > 0 && !disabled && !sending;

  return (
    <div
      className={cn(
        "relative border-t border-border/40 bg-gradient-to-t from-background via-background to-muted/20",
        "shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.12)] dark:shadow-[0_-12px_48px_-16px_rgba(0,0,0,0.45)]",
        "backdrop-blur-md",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/80 to-transparent"
        aria-hidden
      />
      <div className="mx-auto max-w-3xl px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pb-4 sm:pt-4">
        <div
          className={cn(
            "group flex items-end gap-2 rounded-[1.35rem] border bg-card/90 p-2 pl-3 shadow-sm",
            "ring-1 ring-border/60 transition-[box-shadow,border-color,ring-color] duration-200",
            "dark:bg-card/70 dark:ring-border/40",
            "focus-within:border-primary/35 focus-within:shadow-md focus-within:ring-primary/20",
            disabled && "opacity-60"
          )}
        >
          <div
            className="mb-2.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted/80 text-muted-foreground transition-colors group-focus-within:bg-primary/10 group-focus-within:text-primary dark:bg-muted/50"
            aria-hidden
          >
            <MessageSquareText className="size-[1.125rem]" strokeWidth={2} />
          </div>
          <textarea
            ref={taRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || sending}
            className={cn(
              "min-h-[44px] max-h-40 flex-1 resize-none bg-transparent py-2.5 pr-1 text-[15px] leading-snug outline-none",
              "placeholder:text-muted-foreground/55",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            aria-label={placeholder}
          />
          <Button
            type="button"
            size="icon"
            disabled={!canSend}
            className={cn(
              "mb-1 size-11 shrink-0 rounded-2xl transition-all duration-200",
              canSend
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 hover:bg-primary/92 hover:shadow-lg"
                : "bg-muted/80 text-muted-foreground hover:bg-muted"
            )}
            onClick={() => canSend && onSubmit()}
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="size-[1.125rem] animate-spin" />
            ) : (
              <Send className="size-[1.125rem]" strokeWidth={2.25} />
            )}
          </Button>
        </div>
        <div className="mt-2 flex justify-center max-sm:hidden">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/40 px-3 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground dark:bg-muted/25">
            <kbd className="rounded border border-border/60 bg-background/80 px-1 font-mono text-[9px] shadow-sm">
              Enter
            </kbd>
            <span>to send</span>
            <span className="text-border">·</span>
            <kbd className="rounded border border-border/60 bg-background/80 px-1 font-mono text-[9px] shadow-sm">
              Shift+Enter
            </kbd>
            <span>new line</span>
          </span>
        </div>
      </div>
    </div>
  );
}

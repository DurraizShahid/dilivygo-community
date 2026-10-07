"use client";

import * as React from "react";
import { MessageCircle } from "lucide-react";
import { cn } from "../lib/utils";
import { Skeleton } from "./skeleton";
import { ChatMessagesArea, type ChatMessagesAreaProps } from "./chat-messages-area";

export interface OrderChatShellProps {
  className?: string;
  /** Outer flex height, e.g. `h-[calc(100vh-4rem)]` */
  rootClassName?: string;
  /** Top chrome (back button, titles, badges) */
  header: React.ReactNode;
  scrollEndRef?: ChatMessagesAreaProps["scrollEndRef"];
  messagesAreaClassName?: string;
  isLoading: boolean;
  loadingSkeletonCount?: number;
  /** When true and not loading, shows built-in empty state instead of children */
  showEmpty: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  /** Message list (ignored when loading or empty) */
  children: React.ReactNode;
  /** Shown between scroll region and composer (typing indicator) */
  typingSlot?: React.ReactNode;
  /** Typically `<ChatComposer … />` */
  composer: React.ReactNode;
}

export function OrderChatShell({
  className,
  rootClassName,
  header,
  scrollEndRef,
  messagesAreaClassName,
  isLoading,
  loadingSkeletonCount = 4,
  showEmpty,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  children,
  typingSlot,
  composer,
}: OrderChatShellProps) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm",
        rootClassName,
        className
      )}
    >
      {header}
      <ChatMessagesArea
        scrollEndRef={scrollEndRef}
        className={cn("bg-muted/15 px-3 sm:px-4", messagesAreaClassName)}
      >
        {isLoading ? (
          <div className="flex flex-col gap-3 py-2">
            {Array.from({ length: loadingSkeletonCount }).map((_, i) => (
              <Skeleton
                key={i}
                className={cn(
                  "h-14 rounded-2xl",
                  i % 2 === 0
                    ? "w-[min(100%,18rem)]"
                    : "ml-auto w-[min(100%,16rem)]"
                )}
              />
            ))}
          </div>
        ) : showEmpty ? (
          <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 px-4 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
              {emptyIcon ?? <MessageCircle className="size-7 opacity-50" aria-hidden />}
            </div>
            <p className="text-sm font-semibold text-foreground">{emptyTitle}</p>
            {emptyDescription ? (
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                {emptyDescription}
              </p>
            ) : null}
          </div>
        ) : (
          children
        )}
      </ChatMessagesArea>
      {typingSlot}
      {composer}
    </div>
  );
}

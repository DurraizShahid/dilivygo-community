"use client";

import * as React from "react";
import { Check, CheckCheck } from "lucide-react";
import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { formatChatTime } from "../lib/chat-utils";

export interface ChatMessageBubbleProps {
  variant: "sent" | "received";
  children: React.ReactNode;
  /** ISO timestamp */
  createdAt?: string;
  /** Shown above bubble for received messages (e.g. "Support") */
  senderLabel?: string;
  /** Single letter or initials for avatar fallback */
  avatarFallback?: string;
  /** When set (e.g. customer profile / default avatar URL), shown for sent messages */
  sentAvatarSrc?: string;
  sentAvatarFallback?: string;
  /**
   * For `variant="sent"` only: ISO read receipt time, or `null` if delivered but unread.
   * Omit to hide read ticks (e.g. support threads that do not track reads).
   */
  readAt?: string | null;
  className?: string;
}

export function ChatMessageBubble({
  variant,
  children,
  createdAt,
  senderLabel,
  avatarFallback,
  sentAvatarSrc,
  sentAvatarFallback,
  readAt,
  className,
}: ChatMessageBubbleProps) {
  const isSent = variant === "sent";
  const time = createdAt ? formatChatTime(createdAt) : null;
  const showReadRow = isSent && readAt !== undefined;

  return (
    <div
      className={cn(
        "flex w-full gap-2.5",
        isSent ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      {isSent && (sentAvatarSrc || sentAvatarFallback) ? (
        <Avatar className="mt-0.5 size-9 shrink-0 ring-2 ring-background shadow-sm">
          {sentAvatarSrc ? (
            <AvatarImage src={sentAvatarSrc} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
            {sentAvatarFallback || "?"}
          </AvatarFallback>
        </Avatar>
      ) : null}
      {!isSent ? (
        <Avatar className="mt-0.5 size-9 shrink-0 ring-2 ring-background shadow-sm">
          <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
            {avatarFallback || "?"}
          </AvatarFallback>
        </Avatar>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 max-w-[min(85%,28rem)] flex-col gap-1",
          isSent ? "items-end" : "items-start"
        )}
      >
        {!isSent && senderLabel ? (
          <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {senderLabel}
          </span>
        ) : null}
        <div
          className={cn(
            "relative px-3.5 py-2.5 text-[15px] leading-snug shadow-sm",
            isSent
              ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-primary/20"
              : "rounded-2xl rounded-bl-md border border-border/60 bg-card text-card-foreground"
          )}
        >
          <p className="whitespace-pre-wrap break-words">{children}</p>
        </div>
        {time || showReadRow ? (
          <div
            className={cn(
              "flex items-center gap-1 px-1 text-[11px] tabular-nums text-muted-foreground",
              isSent && "flex-row-reverse"
            )}
          >
            {time ? (
              <time dateTime={createdAt}>{time}</time>
            ) : null}
            {showReadRow ? (
              readAt ? (
                <CheckCheck
                  className="size-3 shrink-0 text-sky-500 dark:text-sky-400"
                  aria-label="Read"
                />
              ) : (
                <Check
                  className="size-3 shrink-0 opacity-70"
                  aria-label="Sent"
                />
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

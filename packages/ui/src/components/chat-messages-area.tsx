"use client";

import type { HTMLAttributes } from "react";
import * as React from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { cn } from "../lib/utils";

export interface ChatMessagesAreaProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "ref"> {
  /** Anchor at end of thread — scroll into view when new messages arrive */
  scrollEndRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * Scrollable message list with content anchored to the bottom (newest near composer).
 * Pass messages in chronological order (oldest first).
 */
export const ChatMessagesArea = React.forwardRef<
  HTMLDivElement,
  ChatMessagesAreaProps
>(function ChatMessagesArea(
  { className, children, scrollEndRef, ...props },
  ref
) {
  const [messagesRef] = useAutoAnimate<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth",
        className
      )}
      {...props}
    >
      <div className="flex min-h-full flex-col justify-end">
        <div ref={messagesRef} className="flex flex-col gap-3 px-1 py-4 sm:px-2">
          {children}
          <div
            ref={scrollEndRef}
            className="h-px w-full shrink-0"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
});

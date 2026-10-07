"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "../lib/utils";

export type VirtualWindowListProps<T> = Omit<
  React.HTMLAttributes<HTMLDivElement>,
  "children"
> & {
  items: readonly T[];
  getItemKey: (item: T, index: number) => string;
  /** Initial row height estimate before `measureElement` runs (px). */
  estimateSize: number;
  /**
   * Scrollport classes. Caller must ensure the outer div is a scroll container
   * (e.g. `max-h-[...] overflow-y-auto`), otherwise the virtualizer has no window.
   */
  className?: string;
  /** Class on the inner height rail (for border-l timelines, padding, etc.). */
  innerClassName?: string;
  /** Class applied to every absolute-positioned row wrapper (dividers, padding). */
  rowClassName?: string;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
};

/**
 * Windowed vertical list inside a scroll container — use for long feeds so only
 * visible rows mount. Rows are absolutely positioned and use `measureElement`
 * for variable height. The outer div is itself the scrollport; pass scroll
 * classes via `className`.
 */
export function VirtualWindowList<T>({
  items,
  getItemKey,
  estimateSize,
  className,
  innerClassName,
  rowClassName,
  overscan = 8,
  renderItem,
  role = "list",
  ...rest
}: VirtualWindowListProps<T>) {
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => getItemKey(items[index] as T, index),
  });

  return (
    <div ref={parentRef} role={role} className={cn(className)} {...rest}>
      <div
        className={cn("relative w-full", innerClassName)}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((v) => (
          <div
            key={v.key}
            role="listitem"
            data-index={v.index}
            ref={virtualizer.measureElement}
            className={cn("absolute left-0 top-0 w-full", rowClassName)}
            style={{
              transform: `translateY(${v.start}px)`,
            }}
          >
            {renderItem(items[v.index] as T, v.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

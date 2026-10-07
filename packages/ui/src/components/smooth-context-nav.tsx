"use client";

/**
 * Kokonut UI "Smooth Tab" sliding pill toolbar, adapted for route navigation (no card panel).
 * @see https://kokonutui.com — MIT
 */

import type { LucideIcon } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/utils";

export type SmoothContextNavItem = {
  id: string;
  href: string;
  title: React.ReactNode;
  icon?: LucideIcon;
};

export type SmoothContextNavLinkProps = {
  href: string;
  className?: string;
  children: React.ReactNode;
  "aria-current"?: "page" | undefined;
  prefetch?: boolean;
};

export type SmoothContextNavProps = {
  items: SmoothContextNavItem[];
  /** Stable id of the active item (derive from pathname in the parent). */
  activeItemId: string;
  ariaLabel: string;
  className?: string;
  /** Sliding indicator — use theme primary by default */
  activeColor?: string;
  /** Merged onto inactive links (after defaults). */
  inactiveLinkClassName?: string;
  /** Merged onto the selected link (after defaults). */
  selectedLinkClassName?: string;
  LinkComponent: React.ComponentType<SmoothContextNavLinkProps>;
};

export function SmoothContextNav({
  items,
  activeItemId,
  ariaLabel,
  className,
  activeColor = "bg-primary",
  inactiveLinkClassName,
  selectedLinkClassName,
  LinkComponent,
}: SmoothContextNavProps) {
  const selectedItem =
    items.find((item) => item.id === activeItemId) ?? items[0];
  const selectedId = selectedItem?.id ?? "";

  const gridTemplateColumns = `repeat(${items.length}, minmax(0, 1fr))`;

  return (
    <nav
      aria-label={ariaLabel}
      className="flex w-full min-w-0 justify-center overflow-x-auto py-0 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15"
    >
      <div
        className={cn(
          "relative mx-auto flex w-max min-w-full max-w-full items-center gap-1 rounded-xl border bg-background p-1",
          className,
        )}
      >
        <div
          className="relative z-[2] grid w-full gap-1"
          style={{ gridTemplateColumns }}
        >
          {items.map((item) => {
            const isSelected = selectedId === item.id;
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="flex min-h-0 min-w-0 justify-center"
              >
                <LinkComponent
                  href={item.href}
                  prefetch
                  aria-current={isSelected ? "page" : undefined}
                  className={cn(
                    "relative flex w-full min-w-0 items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-center font-medium text-xs sm:text-[13px]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? cn("text-primary-foreground shadow-sm", activeColor, selectedLinkClassName)
                      : cn(
                          "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                          inactiveLinkClassName,
                        ),
                  )}
                >
                  {Icon ? (
                    <Icon
                      className="size-3.5 shrink-0 opacity-90 sm:size-4"
                      aria-hidden
                    />
                  ) : null}
                  <span
                    className={cn(
                      "min-w-0 truncate text-center leading-snug",
                      Icon ? "flex-1" : "block w-full",
                    )}
                  >
                    {item.title}
                  </span>
                </LinkComponent>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

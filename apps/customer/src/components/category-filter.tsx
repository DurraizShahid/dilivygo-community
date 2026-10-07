"use client";

import type { BrowseCategoryPreset } from "@dilivygo/types";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Utensils,
  Pizza,
  Coffee,
  Salad,
  Beef,
  Sandwich,
  IceCream,
  Soup,
  Fish,
  Flame,
  type LucideIcon,
} from "lucide-react";

const ICON_BY_NAME: Record<string, LucideIcon> = {
  Utensils,
  Pizza,
  Coffee,
  Salad,
  Beef,
  Sandwich,
  IceCream,
  Soup,
  Fish,
  Flame,
};

function iconForPreset(p: BrowseCategoryPreset): LucideIcon {
  if (p.icon && ICON_BY_NAME[p.icon]) return ICON_BY_NAME[p.icon];
  const needle = `${p.code ?? ""} ${p.label ?? ""}`.toLowerCase();
  if (/(pizza|pizz)/.test(needle)) return Pizza;
  if (/(burger|fast\s*food|sandwich|wrap|shawarma)/.test(needle)) return Sandwich;
  if (/(coffee|cafe|tea|latte|espresso)/.test(needle)) return Coffee;
  if (/(salad|healthy|vegan|vegetarian|green)/.test(needle)) return Salad;
  if (/(beef|steak|meat|kebab|grill|bbq)/.test(needle)) return Beef;
  if (/(ice\s*cream|dessert|sweet|cake|bakery|pastry|donut|gulab|jamun)/.test(needle))
    return IceCream;
  if (/(soup|ramen|noodle|pho)/.test(needle)) return Soup;
  if (/(fish|seafood|shrimp|prawn|sushi)/.test(needle)) return Fish;
  if (/(spicy|hot|chilli|chili|peri|tandoori)/.test(needle)) return Flame;
  return Utensils;
}

function sortBrowsePresets(presets: BrowseCategoryPreset[]): BrowseCategoryPreset[] {
  return [...presets].sort(
    (a, b) =>
      (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.label.localeCompare(b.label),
  );
}

export interface CategoryFilterProps {
  /** From platform theme (`browseCategoryPresets`); empty shows only “All”. */
  presets: BrowseCategoryPreset[];
  active: string;
  onSelect: (id: string) => void;
  /** Dark dashboard home (charcoal + orange accent). */
  variant?: "default" | "dashboard";
}

const SCROLL_EDGE_EPS = 6;

const PRESET_BADGE_COLORS = [
  "bg-amber-500/15 text-amber-600",
  "bg-emerald-500/15 text-emerald-600",
  "bg-sky-500/15 text-sky-600",
  "bg-violet-500/15 text-violet-600",
  "bg-rose-500/15 text-rose-600",
  "bg-orange-500/15 text-orange-600",
] as const;

function colorClassForPresetId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h + id.charCodeAt(i)) % 65_536;
  return PRESET_BADGE_COLORS[h % PRESET_BADGE_COLORS.length];
}

export function CategoryFilter({
  presets,
  active,
  onSelect,
  variant = "default",
}: CategoryFilterProps) {
  const { t } = useTranslation("customer");
  const sorted = sortBrowsePresets(presets);
  const items: Array<{ id: string; label: string; preset: BrowseCategoryPreset | null }> = [
    { id: "all", label: "All", preset: null },
    ...sorted.map((p) => ({ id: p.code, label: p.label, preset: p })),
  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth + SCROLL_EDGE_EPS;
    setOverflow(hasOverflow);
    if (!hasOverflow) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(scrollLeft > SCROLL_EDGE_EPS);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - SCROLL_EDGE_EPS);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, updateScrollState]);

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.min(320, Math.max(160, Math.floor(el.clientWidth * 0.65)));
    el.scrollBy({ left: step * dir, behavior: "smooth" });
  }, []);

  const arrowBtnClass =
    variant === "dashboard"
      ? "flex h-24 w-9 shrink-0 items-center justify-center rounded-[14px] border border-border/60 bg-card/95 text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-muted/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-25 sm:h-[6.75rem] sm:w-10"
      : "flex h-24 w-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/95 text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-muted/90 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-25 sm:h-[6.75rem] sm:w-10";

  return (
    <div className="flex items-stretch gap-1.5 sm:gap-2">
      {overflow ? (
        <button
          type="button"
          className={arrowBtnClass}
          aria-label={t("home.scrollCategoriesLeft")}
          disabled={!canScrollLeft}
          onClick={() => scrollByDir(-1)}
        >
          <ChevronLeft className="size-5 shrink-0" aria-hidden />
        </button>
      ) : null}

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="hide-scrollbar min-w-0 flex-1 overflow-x-auto overflow-y-visible pb-2"
      >
        <div className="flex w-max gap-3">
          {items.map(({ id, label, preset }) => {
            const Icon = preset ? iconForPreset(preset) : LayoutGrid;
            const imgUrl = preset?.iconImageUrl?.trim();
            const badgeColor = preset ? colorClassForPresetId(id) : "";
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "group flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1.5 rounded-[16px] border p-2 transition-all duration-200 sm:h-[6.75rem] sm:w-[6.75rem] sm:gap-2 sm:p-2.5",
                  variant === "dashboard" &&
                    (active === id
                      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "border-border/50 bg-card/90 text-muted-foreground shadow-sm hover:border-primary/25 hover:bg-muted/60 hover:text-foreground"),
                  variant === "default" &&
                    (active === id
                      ? "border-primary/30 bg-gradient-to-br from-primary to-primary/85 text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-primary/15"
                      : "border-border/50 bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm hover:border-primary/25 hover:bg-muted/80 hover:text-foreground hover:shadow-md"),
                )}
              >
                {imgUrl ? (
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center overflow-hidden sm:size-10",
                      active === id
                        ? "bg-transparent"
                        : variant === "dashboard"
                          ? "rounded-full bg-white/10"
                          : "rounded-full bg-muted/35",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- theme URLs are arbitrary Supabase/CDN hosts */}
                    <img
                      src={imgUrl}
                      alt=""
                      className="max-h-[72%] max-w-[72%] object-contain transition-transform duration-200 group-hover:scale-105"
                    />
                  </span>
                ) : !preset ? (
                  <Icon
                    className={cn(
                      "size-9 shrink-0 transition-transform group-hover:scale-110 sm:size-10",
                      active === id &&
                        (variant === "dashboard" ? "text-white" : "text-primary-foreground"),
                    )}
                  />
                ) : active === id ? (
                  <Icon
                    className={cn(
                      "size-9 shrink-0 transition-transform group-hover:scale-110 sm:size-10",
                      variant === "dashboard" ? "text-white" : "text-primary-foreground",
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full sm:size-10",
                      variant === "dashboard" ? "bg-white/10" : cn("bg-muted/35", badgeColor),
                    )}
                  >
                    <Icon className="size-5 transition-transform group-hover:scale-110 sm:size-6" />
                  </span>
                )}
                <span className="line-clamp-2 w-full px-0.5 text-center text-[11px] font-semibold leading-tight sm:text-xs">
                  {label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {overflow ? (
        <button
          type="button"
          className={arrowBtnClass}
          aria-label={t("home.scrollCategoriesRight")}
          disabled={!canScrollRight}
          onClick={() => scrollByDir(1)}
        >
          <ChevronRight className="size-5 shrink-0" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

"use client";

import {
  Heart,
  Leaf,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  Star,
  Wheat,
  NutOff,
} from "lucide-react";
import { PriceDisplay, cn } from "@dilivygo/ui";
import { DIETARY_TAG_OPTIONS, type Product } from "@dilivygo/types";
import type { LucideIcon } from "lucide-react";

const DIETARY_VISUAL: Record<
  string,
  { Icon: LucideIcon; className: string }
> = {
  vegan: { Icon: Leaf, className: "text-primary" },
  halal: { Icon: Sparkles, className: "text-primary" },
  gluten_free: { Icon: Wheat, className: "text-primary" },
  nut_free: { Icon: NutOff, className: "text-primary" },
};

function dietaryLabel(tag: string) {
  return DIETARY_TAG_OPTIONS.find((o) => o.value === tag)?.label ?? tag.replace(/_/g, " ");
}

function StarRatingRow({ value, reviewLabel }: { value: number; reviewLabel: string }) {
  const filled = Math.min(5, Math.max(0, Math.round(value)));
  return (
    <div className="mt-2 flex min-h-[1.25rem] items-center gap-2">
      <div className="flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "size-3.5 shrink-0",
              i < filled
                ? "fill-primary text-primary"
                : "fill-transparent text-muted-foreground/35"
            )}
          />
        ))}
      </div>
      {reviewLabel ? (
        <span className="truncate text-[11px] text-muted-foreground">{reviewLabel}</span>
      ) : null}
    </div>
  );
}

export type MenuProductTileProps = {
  product: Product;
  currency?: string;
  quantity: number;
  isFavorite: boolean;
  onFavoriteClick: () => void;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  /** Shop-level rating hint shown on each tile (menu reference layout). */
  ratingDisplay?: { average: number; reviewLabel: string } | null;
};

export function MenuProductTile({
  product,
  currency,
  quantity,
  isFavorite,
  onFavoriteClick,
  onAdd,
  onIncrement,
  onDecrement,
  ratingDisplay,
}: MenuProductTileProps) {
  const primaryTag = product.dietaryTags?.[0];
  const badgeTags = product.dietaryTags?.slice(0, 2) ?? [];
  const visual = primaryTag ? DIETARY_VISUAL[primaryTag] : null;
  const FooterIcon = visual?.Icon ?? Sparkles;
  const footerClass = visual?.className ?? "text-muted-foreground";

  return (
    <div className="group flex h-full min-h-[320px] flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-[box-shadow,transform] hover:border-border hover:shadow-md">
      <div className="relative px-3 pt-3">
        <div className="relative h-[168px] overflow-hidden rounded-xl bg-muted">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="size-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-5xl opacity-30">🍽</div>
          )}

          {badgeTags.length > 0 ? (
            <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-3.5rem)] flex-wrap gap-1">
              {badgeTags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground shadow-sm ring-1 ring-border/40 backdrop-blur-sm"
                >
                  {dietaryLabel(tag)}
                </span>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFavoriteClick();
            }}
            className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-background/95 text-muted-foreground shadow-sm ring-1 ring-border/40 backdrop-blur-sm transition-colors hover:text-primary"
            aria-label="Toggle favorite"
          >
            <Heart className={cn("size-4", isFavorite && "fill-current text-primary")} />
          </button>

          <div className="absolute bottom-3 right-3">
            {quantity > 0 ? (
              <div
                className="flex items-center gap-0.5 rounded-full border border-border/60 bg-background/95 px-1 py-0.5 shadow-lg backdrop-blur-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={onDecrement}
                  className="flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-4" />
                </button>
                <span className="min-w-[1.25rem] text-center text-sm font-bold tabular-nums text-foreground">
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={onIncrement}
                  className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
                  aria-label="Increase quantity"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd();
                }}
                className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105 active:scale-95"
                aria-label={`Add ${product.name}`}
              >
                <ShoppingCart className="size-5 stroke-[2]" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-3 pb-3 pt-2">
        <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground">
          {product.name}
        </h3>
        <PriceDisplay
          cents={product.priceCents}
          currency={currency}
          className="mt-1 text-base font-bold text-primary"
        />
        {ratingDisplay ? (
          <StarRatingRow value={ratingDisplay.average} reviewLabel={ratingDisplay.reviewLabel} />
        ) : (
          <div className="mt-2 min-h-[1.25rem]" />
        )}
        {product.description ? (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        ) : null}

        {primaryTag ? (
          <div className="mt-auto flex items-center gap-1.5 pt-2">
            <FooterIcon className={cn("size-3.5 shrink-0", footerClass)} aria-hidden />
            <span className={cn("text-xs font-medium leading-none", footerClass)}>
              {dietaryLabel(primaryTag)}
            </span>
          </div>
        ) : (
          <div className="mt-2 min-h-[1.125rem]" />
        )}
      </div>
    </div>
  );
}

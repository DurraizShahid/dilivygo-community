"use client";

import Link from "next/link";
import { Star, UtensilsCrossed } from "lucide-react";
import { cn, PriceDisplay } from "@dilivygo/ui";
import type { Product, Shop } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";

export interface PopularDishItem {
  product: Product;
  shop: Shop;
  rating: number;
}

export function HomePopularDishesStrip({
  items,
  className,
}: {
  items: PopularDishItem[];
  className?: string;
}) {
  const { t } = useTranslation("customer");
  if (!items.length) return null;

  return (
    <div
      className={cn(
        "hide-scrollbar flex gap-4 overflow-x-auto pb-2 pt-0.5",
        className,
      )}
    >
      {items.map(({ product, shop, rating }) => {
        const ratingLabel =
          typeof rating === "number" && rating > 0 ? rating.toFixed(1) : "—";
        const href = `/restaurant/${shop.projectRef}/${shop.id}`;

        return (
          <Link
            key={`${shop.id}-${product.id}`}
            href={href}
            className={cn(
              "group flex w-[200px] shrink-0 flex-col overflow-hidden rounded-[18px] border border-border bg-card transition-all",
              "hover:border-primary/45 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            )}
          >
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-muted">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote product images
                <img
                  src={product.imageUrl}
                  alt=""
                  className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground/35">
                  <UtensilsCrossed className="size-12" aria-hidden />
                </div>
              )}
              <span className="absolute right-2 top-2 rounded-lg bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground shadow-sm">
                {t("home.popularBadge")}
              </span>
              <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
                <Star
                  className="size-3.5 fill-current text-primary"
                  aria-hidden
                />
                {ratingLabel}
              </div>
            </div>
            <div className="flex min-h-[3.25rem] items-center justify-between gap-2 border-t border-border px-3 py-2.5">
              <span className="line-clamp-2 min-h-[2.5rem] flex-1 text-left text-[13px] font-semibold leading-snug text-foreground">
                {product.name}
              </span>
              <span className="shrink-0 rounded-lg bg-muted px-2 py-1 text-xs font-bold tabular-nums text-foreground ring-1 ring-border">
                <PriceDisplay cents={product.priceCents} />
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

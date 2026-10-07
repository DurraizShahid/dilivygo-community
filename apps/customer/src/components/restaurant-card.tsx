"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Heart, MapPin, Clock, Star, Store, ArrowUpRight, Circle } from "lucide-react";
import { cn, formatPrice, useCurrency } from "@dilivygo/ui";
import type { Shop } from "@dilivygo/types";

interface RestaurantMetrics {
  etaMinutes?: number;
  rating?: number;
  reviewCount?: number;
  minOrderCents?: number;
  distanceKm?: number | null;
}

interface RestaurantCardProps {
  shop: Shop;
  className?: string;
  isFavorite?: boolean;
  onToggleFavorite?: (shop: Shop) => void;
  metrics?: RestaurantMetrics;
}

const MotionLink = motion.create(Link);

export function RestaurantCard({
  shop,
  className,
  isFavorite,
  onToggleFavorite,
  metrics,
}: RestaurantCardProps) {
  const currency = useCurrency();
  const etaLabel = metrics?.etaMinutes ? `${metrics.etaMinutes} min` : "25-35 min";
  const ratingLabel = typeof metrics?.rating === "number" && metrics.rating > 0 ? metrics.rating.toFixed(1) : "New";
  const minOrderCents = typeof metrics?.minOrderCents === "number" ? metrics.minOrderCents : 0;
  const distanceLabel = typeof metrics?.distanceKm === "number" ? `${metrics.distanceKm.toFixed(1)} km` : null;
  const heroImageUrl = shop.bannerUrl || shop.logoUrl;
  const showLogoBadge = Boolean(shop.logoUrl && shop.bannerUrl);

  return (
    <MotionLink
      href={`/restaurant/${shop.projectRef}/${shop.id}`}
      whileHover={{ y: -6, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={cn(
        "group relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm shadow-black/5 backdrop-blur-sm transition-all duration-300",
        "hover:border-primary/35 hover:shadow-xl hover:shadow-primary/10 dark:hover:shadow-black/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      <span className="card-shine" aria-hidden />

      {/* Image — fixed aspect so every card matches */}
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden bg-muted">
        {heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt={shop.name}
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-muted via-primary/5 to-accent/10">
            <Store className="size-12 text-muted-foreground/35" />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />

        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full border border-white/25 bg-background/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-lg backdrop-blur-md">
          <Clock className="size-3.5 opacity-80" />
          <span>{etaLabel}</span>
        </div>

        {onToggleFavorite && (
          <motion.button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavorite(shop);
            }}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.85 }}
            className="absolute left-3 top-3 flex size-9 items-center justify-center rounded-full border border-white/25 bg-background/90 text-foreground shadow-lg backdrop-blur-md transition-colors hover:bg-background"
            aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
          >
            <Heart
              className={cn(
                "size-4 transition-transform duration-300",
                isFavorite && "fill-current text-primary scale-110",
              )}
            />
          </motion.button>
        )}

        <div className="absolute bottom-3 right-3 flex size-9 items-center justify-center rounded-full bg-background/92 text-foreground opacity-0 shadow-lg backdrop-blur-md transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1">
          <ArrowUpRight className="size-4" />
        </div>

        {showLogoBadge && shop.logoUrl && (
          <div className="absolute bottom-3 left-3 size-12 overflow-hidden rounded-xl border-2 border-white/90 bg-background shadow-lg ring-2 ring-black/5 dark:ring-white/10">
            <img src={shop.logoUrl} alt="" className="size-full object-cover" />
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 min-h-[2.5rem] text-base font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">
              {shop.name}
            </h3>
            <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-snug text-muted-foreground">
              {shop.description?.trim() ? shop.description : "\u00a0"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary ring-1 ring-primary/20">
            <Star className="size-3 fill-current" />
            <span>{ratingLabel}</span>
            {typeof metrics?.reviewCount === "number" && metrics.reviewCount > 0 && (
              <span className="font-medium opacity-80">({metrics.reviewCount})</span>
            )}
          </div>
        </div>

        <div className="mt-2 flex h-5 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0 text-primary/70" />
          <span className="min-w-0 truncate">{shop.address?.trim() ? shop.address : "\u00a0"}</span>
        </div>

        <div className="hide-scrollbar mt-3 flex h-7 shrink-0 flex-nowrap items-center gap-2 overflow-x-auto">
          {shop.isOpen === false ? (
            <span className="shrink-0 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive ring-1 ring-destructive/20">
              <Circle className="mr-1 inline-block size-2 fill-current" />
              Closed
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/20">
              <Circle className="mr-1 inline-block size-2 fill-current" />
              Open
            </span>
          )}
          <span className="shrink-0 rounded-full bg-gradient-to-r from-primary/15 to-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/15">
            Free delivery
          </span>
          {minOrderCents > 0 && (
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              Min. order {formatPrice(minOrderCents, currency)}
            </span>
          )}
          {distanceLabel && (
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">{distanceLabel}</span>
          )}
        </div>
      </div>
    </MotionLink>
  );
}

"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { cn } from "@dilivygo/ui";
import type { Shop } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";

export interface NearbyStripMetrics {
  rating?: number;
  distanceKm?: number | null;
}

export function HomeNearbyRestaurantStrip({
  shops,
  metricsById,
  className,
}: {
  shops: Shop[];
  metricsById: Map<string, NearbyStripMetrics>;
  className?: string;
}) {
  const { t } = useTranslation("customer");
  if (!shops.length) return null;

  return (
    <div
      className={cn(
        "hide-scrollbar flex gap-4 overflow-x-auto pb-2 pt-0.5",
        className,
      )}
    >
      {shops.map((shop) => {
        const m = metricsById.get(shop.id);
        const rating =
          typeof m?.rating === "number" && m.rating > 0
            ? m.rating.toFixed(1)
            : null;
        const dist =
          typeof m?.distanceKm === "number"
            ? `${m.distanceKm.toFixed(1)} km`
            : null;

        return (
          <Link
            key={shop.id}
            href={`/restaurant/${shop.projectRef}/${shop.id}`}
            className={cn(
              "flex min-h-[88px] min-w-[min(100%,288px)] max-w-[320px] shrink-0 items-center gap-4 rounded-[18px] border border-border bg-card p-4 transition-all",
              "hover:border-primary/45 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            )}
          >
            <div className="relative size-[52px] shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
              {shop.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote shop logos
                <img
                  src={shop.logoUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground/35">
                  <Store className="size-6" aria-hidden />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="truncate text-[15px] font-semibold leading-tight text-foreground">
                  {shop.name}
                </span>
                {rating != null && (
                  <span
                    className="shrink-0 text-xs font-semibold text-primary"
                    aria-label={`${rating} stars`}
                  >
                    ★ {rating}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="min-w-0 shrink-0 tabular-nums">
                  {dist ?? "\u00a0"}
                </span>
                <span className="font-semibold text-primary">
                  {t("home.freeDelivery")}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

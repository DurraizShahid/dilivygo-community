"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { useVendorPlacedOrders } from "@/providers/vendor-placed-orders";

/** Badge count on the Orders nav entry (sidebar / top tabs / mobile). */
export function VendorOrdersNavBadge({ className }: { className?: string }) {
  const { placedCount } = useVendorPlacedOrders();
  if (placedCount <= 0) return null;
  return (
    <span
      className={cn(
        "flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-background",
        className,
      )}
      aria-hidden
    >
      {placedCount > 99 ? "99+" : placedCount}
    </span>
  );
}

/** Header bell: links to orders (placed tab) and reflects new-order count. */
export function VendorNotificationsBell() {
  const { t } = useTranslation("vendor");
  const { placedCount } = useVendorPlacedOrders();
  return (
    <Link
      href="/orders?tab=placed"
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition",
        "hover:bg-muted/80 hover:text-foreground",
        placedCount > 0 && "text-foreground",
      )}
      aria-label={
        placedCount > 0
          ? t("orders.notificationsBellNew", { count: placedCount })
          : t("orders.notificationsBellEmpty")
      }
    >
      <Bell className="size-[18px]" />
      {placedCount > 0 ? (
        <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-background">
          {placedCount > 9 ? "9+" : placedCount}
        </span>
      ) : null}
    </Link>
  );
}

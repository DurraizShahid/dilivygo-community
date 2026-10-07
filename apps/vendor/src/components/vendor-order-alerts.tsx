"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import { cn } from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { VendorNewOrderToastContent } from "@/components/vendor-new-order-toast-content";
import { useVendorPlacedOrders } from "@/providers/vendor-placed-orders";
import { useWSEvent } from "@/providers/ws-provider";
import { useVendorWebPush } from "@/hooks/use-vendor-web-push";

function statusToCamel(status: string): string {
  return status.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Global new-order UX: web push, document title, dismissible banner, and toasts (incl. strong toast for `placed`). */
export function VendorOrderAlerts() {
  const { t } = useTranslation("vendor");
  const pathname = usePathname();
  const { placedCount } = useVendorPlacedOrders();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const prevPlacedRef = useRef(0);

  useVendorWebPush();

  useEffect(() => {
    if (placedCount > prevPlacedRef.current) {
      queueMicrotask(() => setBannerDismissed(false));
    }
    prevPlacedRef.current = placedCount;
  }, [placedCount]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\)\s+/, "");
    if (placedCount <= 0) {
      document.title = base;
      return;
    }
    document.title = `(${placedCount}) ${base}`;
    return () => {
      document.title = document.title.replace(/^\(\d+\)\s+/, "");
    };
  }, [placedCount]);

  useWSEvent("order:status_changed", (event) => {
    const camel = statusToCamel(event.status);
    const statusLabel = t(`orders.status.${camel}` as "orders.status.placed", {
      defaultValue: event.status.replace(/_/g, " "),
    });

    if (event.status === "placed") {
      toast.custom(
        (tid) => (
          <VendorNewOrderToastContent toastId={tid} orderId={event.orderId} />
        ),
        {
          id: `new-order-${event.orderId}`,
          duration: 28_000,
          dismissible: true,
          unstyled: true,
        },
      );
      return;
    }

    toast.info(
      <span className="block font-semibold text-white">
        {t("orders.orderStatusToastTitle", { id: event.orderId.slice(0, 8) })}
      </span>,
      {
        id: `order-ws-${event.orderId}-${event.status}`,
        duration: 7500,
        description: (
          <span className="text-[13px] leading-snug text-white/75">
            {t("orders.orderStatusToastNow", { status: statusLabel })}
          </span>
        ),
        classNames: {
          toast:
            "vendor-sonner-order-update !w-[min(100vw-2rem,20rem)] !rounded-xl !border !border-white/[0.12] !bg-[#161616] !p-4 !shadow-xl",
          title: "!text-[15px] !font-semibold !text-white !mb-0",
          description: "!text-[13px] !text-white/75 !mt-1.5 !leading-snug",
        },
      },
    );
  });

  const showBanner =
    placedCount > 0 && !pathname.startsWith("/orders") && !bannerDismissed;

  if (!showBanner) return null;

  return (
    <div
      className={cn(
        "sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-primary/35",
        "bg-gradient-to-r from-accent/90 via-card to-accent/90 px-4 py-2.5 text-sm text-foreground shadow-md sm:px-6",
      )}
      role="status"
      aria-live="polite"
    >
      <p className="min-w-0 font-medium">
        {placedCount === 1
          ? t("orders.newOrderBannerOne")
          : t("orders.newOrderBannerMany", { count: placedCount })}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href="/orders?tab=placed"
          className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          {t("orders.newOrderBannerCta")}
        </Link>
        <button
          type="button"
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={t("orders.newOrderBannerDismiss")}
          onClick={() => setBannerDismissed(true)}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}

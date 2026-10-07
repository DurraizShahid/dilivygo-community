"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Package,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  X,
} from "lucide-react";
import { cn, PriceDisplay, OrderStatusBadge } from "@dilivygo/ui";
import { useOrders } from "@/hooks/use-orders";
import { useAuthStore } from "@/stores/auth-store";
import type { Order, OrderStatus } from "@dilivygo/types";

const ACTIVE_STATUSES: OrderStatus[] = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "arrived",
];

const PROGRESS_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Accepted" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "assigned", label: "Rider" },
  { status: "picked_up", label: "On the way" },
  { status: "arrived", label: "Arrived" },
];

function getStepIndex(status: OrderStatus): number {
  const idx = PROGRESS_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

function MiniProgress({ status }: { status: OrderStatus }) {
  const current = getStepIndex(status);
  const total = PROGRESS_STEPS.length - 1;
  const pct = Math.round((current / total) * 100);

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted/60 sm:w-32">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-semibold text-primary">
        {PROGRESS_STEPS[current]?.label ?? status}
      </span>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <Link
      href={`/orders/${order.id}`}
      className="group flex items-center gap-3 py-0.5"
    >
      {/* Icon */}
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Package className="size-4" />
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-tight">
            #{order.id.slice(0, 8)}
          </span>
          <OrderStatusBadge status={order.status} className="scale-90 origin-left" />
        </div>
        <MiniProgress status={order.status} />
      </div>

      {/* Price + chevron */}
      <div className="flex shrink-0 items-center gap-1.5">
        <PriceDisplay
          cents={order.totalCents}
          currency={order.currency ? order.currency.toUpperCase() : undefined}
          className="text-sm font-semibold"
        />
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export function ActiveOrderBar() {
  const { isAuthenticated } = useAuthStore();
  const pathname = usePathname();
  const { data: orders } = useOrders();
  const [dismissed, setDismissed] = useState(false);
  const [page, setPage] = useState(0);

  const activeOrders = useMemo(
    () =>
      (orders ?? []).filter((o) =>
        ACTIVE_STATUSES.includes(o.status as OrderStatus)
      ),
    [orders]
  );

  // Don't show when user is already on an active order detail page
  const onOrderDetailPage = /^\/orders\/[^/]+$/.test(pathname ?? "");

  if (
    !isAuthenticated ||
    activeOrders.length === 0 ||
    dismissed ||
    onOrderDetailPage
  ) {
    return null;
  }

  const safeIndex = Math.min(page, activeOrders.length - 1);
  const current = activeOrders[safeIndex];

  return (
    <div
      role="region"
      aria-label="Active order progress"
      className={cn(
        "fixed bottom-0 left-[76px] right-0 z-40",
        "flex justify-center px-4 pb-4 pointer-events-none"
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-lg",
          "rounded-2xl border border-border/60 bg-card/95 shadow-xl shadow-black/10 backdrop-blur-md",
          "px-4 py-3"
        )}
      >
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Active order
            {activeOrders.length > 1 && (
              <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                {activeOrders.length}
              </span>
            )}
          </span>

          <div className="flex items-center gap-1">
            {activeOrders.length > 1 && (
              <>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safeIndex === 0}
                  className="flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                  aria-label="Previous order"
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <span className="text-[10px] text-muted-foreground">
                  {safeIndex + 1}/{activeOrders.length}
                </span>
                <button
                  onClick={() =>
                    setPage((p) => Math.min(activeOrders.length - 1, p + 1))
                  }
                  disabled={safeIndex === activeOrders.length - 1}
                  className="flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
                  aria-label="Next order"
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => setDismissed(true)}
              className="flex size-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Dismiss order bar"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Order row */}
        {current && <OrderCard order={current} />}

        {/* Full step pills */}
        {current && (
          <div className="mt-3 flex items-center gap-0.5 overflow-x-auto pb-0.5">
            {PROGRESS_STEPS.map((step, idx) => {
              const currentIdx = getStepIndex(current.status);
              const done = idx < currentIdx;
              const active = idx === currentIdx;
              return (
                <div key={step.status} className="flex flex-1 items-center">
                  <div
                    className={cn(
                      "flex h-1 flex-1 rounded-full transition-colors duration-300",
                      done || active ? "bg-primary" : "bg-muted/60"
                    )}
                  />
                  {idx === PROGRESS_STEPS.length - 1 && (
                    <span
                      className={cn(
                        "ml-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[9px] font-bold",
                        done || active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/20 bg-muted/30 text-muted-foreground/40"
                      )}
                    >
                      <CheckCircle2 className="size-3" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

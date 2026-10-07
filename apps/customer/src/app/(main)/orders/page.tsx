"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, ChevronRight, Package, Star, RotateCcw } from "lucide-react";
import {
  AnimatedList,
  Button,
  Skeleton,
  OrderStatusBadge,
  PriceDisplay,
  buttonVariants,
  cn,
  useConfirm,
} from "@dilivygo/ui";
import { useOrders } from "@/hooks/use-orders";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { api } from "@/lib/api";
import { addOrderItemsToCart, normalizeOrder } from "@/lib/order-utils";
import { PromoBanner } from "@/components/promo-banner";
import { useLanguage } from "@dilivygo/i18n";

export default function OrdersPage() {
  const { language } = useLanguage();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const cart = useCartStore();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const { data: orders, isLoading } = useOrders();

  async function handleReorder(orderId: string) {
    try {
      const response = await api.orders.get(orderId);
      const raw = (response as { order?: unknown })?.order ?? response;
      const order = normalizeOrder(raw);
      if (!order || !order.items?.length) {
        return;
      }
      if (
        (cart.shopId && order.shopId && cart.shopId !== order.shopId) ||
        (cart.projectRef && cart.projectRef !== order.projectRef)
      ) {
        const ok = await confirm({
          title: "Clear cart to reorder?",
          description:
            "Your cart has items from another shop. Continuing will clear your cart.",
          confirmLabel: "Clear cart",
          variant: "destructive",
        });
        if (!ok) return;
        cart.clear();
      }
      const added = addOrderItemsToCart(order, cart);
      if (!added) {
        return;
      }
      router.push("/cart");
    } catch {
    }
  }

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 lg:px-8">
        <Skeleton className="h-9 w-44 rounded-xl" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl px-4 py-8 lg:px-8"
    >
      {confirmDialog}
      <PromoBanner placement="orders_list" />

      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <motion.span
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm"
        >
          <Package className="size-5" />
        </motion.span>
        <h1 className="text-2xl font-extrabold tracking-tight">Your Orders</h1>
      </div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </motion.div>
        ) : !orders || orders.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/30 px-6 py-20 text-center shadow-inner dark:bg-muted/15"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 text-primary ring-2 ring-primary/15 shadow-sm"
            >
              <ClipboardList className="size-10" />
            </motion.div>
            <h3 className="mt-6 text-lg font-bold tracking-tight">No orders yet</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Place your first order to see it here
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                className="mt-8 rounded-full px-8 shadow-md shadow-primary/20"
                onClick={() => router.push("/")}
              >
                Browse restaurants
              </Button>
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AnimatedList className="space-y-3">
              {orders.map((order) => (
                <motion.div
                  layout
                  key={order.id}
                  whileHover={{ scale: 1.01 }}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm transition-all hover:border-primary/25 hover:shadow-md sm:flex-row sm:items-stretch"
                >
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex min-w-0 flex-1 items-center gap-4 p-4"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 transition-transform group-hover:scale-[1.03]">
                      <Package className="size-6 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold tracking-tight">
                          Order #{order.id.slice(0, 8)}
                        </span>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <PriceDisplay
                          cents={order.totalCents}
                          currency={order.currency ? order.currency.toUpperCase() : undefined}
                          className="font-medium"
                        />
                        <span>
                          {new Date(order.createdAt).toLocaleDateString(language, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {order.status === "scheduled" && order.scheduledFor && (
                          <span className="font-semibold text-primary">
                            Scheduled for{" "}
                            {new Date(order.scheduledFor).toLocaleString(language, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-5 shrink-0 self-center text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/60" />
                  </Link>
                  <div className="flex shrink-0 flex-col justify-center gap-2 border-t border-border/50 p-3 sm:w-44 sm:border-l sm:border-t-0 sm:p-4">
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 rounded-xl"
                        onClick={() => handleReorder(order.id)}
                      >
                        <RotateCcw className="size-3.5" />
                        Reorder
                      </Button>
                    </motion.div>
                    {order.status === "completed" ? (
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Link
                          href={`/orders/${order.id}/rate`}
                          className={cn(
                            buttonVariants({ variant: "secondary", size: "sm" }),
                            "inline-flex w-full items-center justify-center gap-1.5 rounded-xl"
                          )}
                        >
                          <Star className="size-3.5" />
                          Rate order
                        </Link>
                      </motion.div>
                    ) : null}
                  </div>
                </motion.div>
              ))}
            </AnimatedList>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

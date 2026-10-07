"use client";

import { useState, useCallback, Suspense, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, ChevronRight, Loader2, Sparkles, Clock, CreditCard, Banknote, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  AnimatedList,
  Badge,
  Button,
  Card,
  CardContent,
  Skeleton,
  EmptyState,
  OrderStatusBadge,
  PriceDisplay,
  cn,
} from "@dilivygo/ui";
import type { Order } from "@dilivygo/types";
import type { TFunction } from "i18next";
import { useTranslation } from "@dilivygo/i18n";
import { useOrders } from "@/hooks/use-orders";
import { useWSEvent } from "@/providers/ws-provider";
import { api } from "@/lib/api";

const STATUS_TAB_VALUES = [
  "all",
  "placed",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
] as const;

function formatTimeAgoShort(iso: string, nowMs: number): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffMs = Math.max(0, nowMs - then);
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function orderAddressShort(order: Order): string | null {
  const addr = order.deliveryAddress?.trim();
  if (!addr) return null;
  if (addr.length <= 48) return addr;
  return `${addr.slice(0, 47)}…`;
}

function paymentMethodLabel(order: Order): { label: string; Icon: typeof CreditCard } {
  if (order.posCheckoutMode) return { label: "POS", Icon: CreditCard };
  if (order.paymentIntentId) return { label: "Card", Icon: CreditCard };
  if (order.paymentStatus === "unpaid" || order.paymentStatus === "pending")
    return { label: "Cash", Icon: Banknote };
  if (order.paymentStatus === "paid" || order.paymentStatus === "succeeded")
    return { label: "Card", Icon: CreditCard };
  return { label: String(order.paymentStatus ?? "—"), Icon: CreditCard };
}

function orderItemsPreview(
  items: Array<{ name?: string; quantity?: number }> | undefined,
): { primary: string | null; secondary: string | null } {
  if (!items?.length) return { primary: null, secondary: null };
  const safe = items
    .filter((it) => Boolean(it?.name))
    .map((it) => `${it.quantity ?? 1}× ${String(it.name ?? "")}`.trim())
    .filter(Boolean);
  if (!safe.length) return { primary: null, secondary: null };
  if (safe.length === 1) return { primary: safe[0], secondary: null };
  const more = safe.length > 2 ? `+${safe.length - 2} more` : null;
  return { primary: safe[0], secondary: more ?? safe[1] };
}

function PlacedOrderCardActions({
  order,
  onMutate,
  t,
}: {
  order: Order;
  onMutate: () => void;
  t: TFunction<"vendor">;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(
    action: () => Promise<unknown>,
    loadingKey: string,
    successKey: string,
  ) {
    setLoading(loadingKey);
    try {
      await action();
      toast.success(t(successKey));
      onMutate();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("orders.toastFailed");
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            size="lg"
            className="w-full"
            disabled={!!loading}
            onClick={(e) => {
              e.preventDefault();
              void handleAction(() => api.orders.accept(order.id), "accept", "orders.toastAccepted");
            }}
          >
            {loading === "accept" ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("orders.accept")}
          </Button>
        </motion.div>
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            size="lg"
            variant="destructive"
            className="w-full"
            disabled={!!loading}
            onClick={(e) => {
              e.preventDefault();
              void handleAction(() => api.orders.reject(order.id), "reject", "orders.toastRejected");
            }}
          >
            {loading === "reject" ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("orders.reject")}
          </Button>
        </motion.div>
      </div>
      <Button size="lg" variant="outline" className="w-full" type="button">
        {t("orders.orderDetails")}
      </Button>
    </div>
  );
}

function AcceptedOrderCardActions({
  order,
  onMutate,
  t,
}: {
  order: Order;
  onMutate: () => void;
  t: TFunction<"vendor">;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(
    action: () => Promise<unknown>,
    loadingKey: string,
    successKey: string,
  ) {
    setLoading(loadingKey);
    try {
      await action();
      toast.success(t(successKey));
      onMutate();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("orders.toastFailed");
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button
          size="lg"
          className="w-full"
          disabled={!!loading}
          onClick={(e) => {
            e.preventDefault();
            void handleAction(
              () => api.orders.updateStatus(order.id, "preparing"),
              "startPreparing",
              "orders.toastPreparing",
            );
          }}
        >
          {loading === "startPreparing" ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("orders.startPreparing")}
        </Button>
      </motion.div>
      <Button size="lg" variant="outline" className="w-full" type="button">
        {t("orders.orderDetails")}
      </Button>
    </div>
  );
}

function PreparingOrderCardActions({
  order,
  onMutate,
  t,
}: {
  order: Order;
  onMutate: () => void;
  t: TFunction<"vendor">;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(
    action: () => Promise<unknown>,
    loadingKey: string,
    successKey: string,
  ) {
    setLoading(loadingKey);
    try {
      await action();
      toast.success(t(successKey));
      onMutate();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("orders.toastFailed");
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button
          size="lg"
          className="w-full"
          disabled={!!loading}
          onClick={(e) => {
            e.preventDefault();
            void handleAction(
              () => api.orders.updateStatus(order.id, "ready"),
              "markReady",
              "orders.toastReady",
            );
          }}
        >
          {loading === "markReady" ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("orders.markReady")}
        </Button>
      </motion.div>
      <Button size="lg" variant="outline" className="w-full" type="button">
        {t("orders.orderDetails")}
      </Button>
    </div>
  );
}

function ReadyOrderCardActions({
  order,
  onMutate,
  t,
}: {
  order: Order;
  onMutate: () => void;
  t: TFunction<"vendor">;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(
    action: () => Promise<unknown>,
    loadingKey: string,
    successKey: string,
  ) {
    setLoading(loadingKey);
    try {
      await action();
      toast.success(t(successKey));
      onMutate();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("orders.toastFailed");
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  const canMarkCompleted = order.posCheckoutMode === "kitchen";

  return (
    <div className="flex flex-col gap-2">
      {canMarkCompleted ? (
        <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
          <Button
            size="lg"
            className="w-full"
            disabled={!!loading}
            onClick={(e) => {
              e.preventDefault();
              void handleAction(
                () => api.orders.updateStatus(order.id, "completed"),
                "markPosCompleted",
                "orders.toastPosCompleted",
              );
            }}
          >
            {loading === "markPosCompleted" ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("orders.markPosCompleted")}
          </Button>
        </motion.div>
      ) : null}
      <Button size="lg" variant="outline" className="w-full" type="button">
        {t("orders.orderDetails")}
      </Button>
    </div>
  );
}

function ActionButtons({
  order,
  onMutate,
  t,
  layout = "compact",
}: {
  order: Order;
  onMutate: () => void;
  t: TFunction<"vendor">;
  layout?: "compact" | "prominent";
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleAction(
    action: () => Promise<unknown>,
    loadingKey: string,
    successKey: string,
  ) {
    setLoading(loadingKey);
    try {
      await action();
      toast.success(t(successKey));
      onMutate();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("orders.toastFailed");
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  const btn = (
    loadingKey: string,
    label: string,
    action: () => Promise<unknown>,
    successKey: string,
    buttonVariant: "default" | "destructive" | "outline" = "default",
  ) => (
    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
      <Button
        size={layout === "prominent" ? "lg" : "sm"}
        variant={buttonVariant}
        disabled={!!loading}
        onClick={(e) => {
          e.preventDefault();
          void handleAction(action, loadingKey, successKey);
        }}
      >
        {loading === loadingKey ? (
          <Loader2 className={layout === "prominent" ? "size-4 animate-spin" : "size-3 animate-spin"} />
        ) : (
          label
        )}
      </Button>
    </motion.div>
  );

  switch (order.status) {
    case "placed":
      return (
        <div className={layout === "prominent" ? "grid grid-cols-2 gap-2" : "flex gap-2"}>
          {btn(
            "accept",
            t("orders.accept"),
            () => api.orders.accept(order.id),
            "orders.toastAccepted",
          )}
          {btn(
            "reject",
            t("orders.reject"),
            () => api.orders.reject(order.id),
            "orders.toastRejected",
            "destructive",
          )}
        </div>
      );
    case "accepted":
      return btn(
        "startPreparing",
        t("orders.startPreparing"),
        () => api.orders.updateStatus(order.id, "preparing"),
        "orders.toastPreparing",
      );
    case "preparing":
      return btn(
        "markReady",
        t("orders.markReady"),
        () => api.orders.updateStatus(order.id, "ready"),
        "orders.toastReady",
      );
    case "ready":
      if (order.posCheckoutMode === "kitchen") {
        return btn(
          "markPosCompleted",
          t("orders.markPosCompleted"),
          () => api.orders.updateStatus(order.id, "completed"),
          "orders.toastPosCompleted",
        );
      }
      return null;
    default:
      return null;
  }
}

function OrdersPageContent() {
  const { t } = useTranslation("vendor");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useOrders();
  const [flashOrderIds, setFlashOrderIds] = useState<Set<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  const requestedTab = searchParams.get("tab");
  const activeTab: (typeof STATUS_TAB_VALUES)[number] =
    requestedTab && (STATUS_TAB_VALUES as readonly string[]).includes(requestedTab)
      ? (requestedTab as (typeof STATUS_TAB_VALUES)[number])
      : "all";

  function setActiveTab(tab: (typeof STATUS_TAB_VALUES)[number]) {
    const qs = new URLSearchParams(searchParams.toString());
    if (tab === "all") qs.delete("tab");
    else qs.set("tab", tab);
    const next = qs.toString();
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  const addFlash = useCallback((orderId: string) => {
    setFlashOrderIds((prev) => new Set(prev).add(orderId));
    window.setTimeout(() => {
      setFlashOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }, 10_000);
  }, []);

  useWSEvent("order:status_changed", (event) => {
    if (event.status === "placed") addFlash(event.orderId);
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["orders"] });

  const filteredOrders =
    activeTab === "all"
      ? orders
      : orders?.filter((o) => o.status === activeTab);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { y: 15, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring" as const, stiffness: 300, damping: 25 },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemVariants}>
        <h1 className="text-2xl font-semibold tracking-tight">{t("orders.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("orders.subtitle")}</p>
      </motion.div>

      <motion.div variants={itemVariants} className="overflow-x-auto pb-1 scrollbar-none">
        <div className="inline-flex rounded-full bg-muted p-1">
          {STATUS_TAB_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setActiveTab(value)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.98]",
                activeTab === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "all"
                ? t("orders.filters.all")
                : t(`orders.filters.${value}` as "orders.filters.placed")}
            </button>
          ))}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </motion.div>
        ) : !filteredOrders || filteredOrders.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
          >
            <EmptyState
              icon={<ClipboardList />}
              title={t("orders.noOrders")}
              description={
                activeTab === "all"
                  ? t("orders.emptyDescriptionAll")
                  : t("orders.emptyFiltered", {
                      status: t(`orders.filters.${activeTab}` as "orders.filters.placed"),
                    })
              }
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {filteredOrders.map((order) => (
              <motion.div
                key={order.id}
                variants={itemVariants}
                layout
              >
                <Link href={`/orders/${order.id}`}>
                  <motion.div
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.995 }}
                    className="group"
                  >
                    <Card
                      className={cn(
                        "shadow-sm border-border/60 transition-colors group-hover:border-primary/20 group-hover:bg-primary/[0.02]",
                        (order.status === "placed" ||
                          order.status === "accepted" ||
                          order.status === "preparing" ||
                          order.status === "ready") &&
                          "w-full max-w-[34rem] border-primary/25 bg-gradient-to-br from-primary/[0.06] via-background to-background",
                        flashOrderIds.has(order.id) &&
                          "ring-2 ring-primary/70 shadow-[0_0_24px_rgba(235,94,40,0.22)] bg-primary/[0.03]",
                      )}
                    >
                      {order.status === "placed" ||
                      order.status === "accepted" ||
                      order.status === "preparing" ||
                      order.status === "ready" ? (
                        <CardContent className="p-6 sm:p-7">
                          <div className="space-y-5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                      <ClipboardList className="size-4" />
                                    </div>
                                    {flashOrderIds.has(order.id) ? (
                                      <motion.div
                                        animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                      >
                                        <Sparkles className="size-4 text-primary" />
                                      </motion.div>
                                    ) : null}
                                    <div className="min-w-0">
                                      <div className="text-base font-semibold tracking-tight">
                                        {t("orders.orderNumber", { number: order.id.slice(0, 8) })}
                                      </div>
                                      <div className="mt-0.5 text-sm text-muted-foreground">
                                        {formatTimeAgoShort(order.createdAt, nowMs)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <OrderStatusBadge status={order.status} />
                                    {order.posCheckoutMode === "quick" ? (
                                      <Badge variant="secondary" className="text-[10px] font-medium">
                                        {t("orders.posWalkIn")}
                                      </Badge>
                                    ) : null}
                                    {order.posCheckoutMode === "kitchen" ? (
                                      <Badge variant="outline" className="text-[10px] font-medium">
                                        {t("orders.posKitchen")}
                                      </Badge>
                                    ) : null}
                                  </div>
                                </div>
                                <div className="mt-3 space-y-2 text-sm">
                                  {orderAddressShort(order) ? (
                                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                                      <MapPin className="size-4 text-muted-foreground/70" />
                                      <span className="min-w-0 truncate">{orderAddressShort(order)}</span>
                                    </div>
                                  ) : null}
                                  {(() => {
                                    const pay = paymentMethodLabel(order);
                                    return (
                                      <div className="inline-flex items-center gap-2 text-muted-foreground">
                                        <pay.Icon className="size-4 text-muted-foreground/70" />
                                        <span>
                                          {t("orders.paymentMethod")}:{" "}
                                          <span className="font-medium text-foreground/90">{pay.label}</span>
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                              <ChevronRight className="mt-1 size-4 text-muted-foreground/30 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                            </div>

                            {order.items?.length ? (
                              <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
                                {(() => {
                                  const preview = orderItemsPreview(order.items);
                                  return (
                                    <div className="space-y-1">
                                      {preview.primary ? (
                                        <div className="text-sm font-medium">{preview.primary}</div>
                                      ) : null}
                                      {preview.secondary ? (
                                        <div className="text-xs text-muted-foreground">{preview.secondary}</div>
                                      ) : null}
                                    </div>
                                  );
                                })()}
                              </div>
                            ) : null}

                            <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-emerald-50/40 px-4 py-3 dark:bg-emerald-950/20">
                              <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                <Clock className="size-4 text-emerald-700/70 dark:text-emerald-300/80" />
                                {t("orders.total")}
                              </div>
                              <PriceDisplay cents={order.totalCents} className="text-lg font-semibold" />
                            </div>

                            {order.status === "placed" ? (
                              <PlacedOrderCardActions order={order} onMutate={invalidate} t={t} />
                            ) : order.status === "accepted" ? (
                              <AcceptedOrderCardActions order={order} onMutate={invalidate} t={t} />
                            ) : order.status === "preparing" ? (
                              <PreparingOrderCardActions order={order} onMutate={invalidate} t={t} />
                            ) : (
                              <ReadyOrderCardActions order={order} onMutate={invalidate} t={t} />
                            )}
                          </div>
                        </CardContent>
                      ) : (
                        <CardContent className="flex items-center justify-between p-4 sm:p-5">
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <div className="flex items-center gap-1.5">
                                {flashOrderIds.has(order.id) && (
                                  <motion.div
                                    animate={{ rotate: [0, 15, -15, 0], scale: [1, 1.2, 1] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                  >
                                    <Sparkles className="size-3.5 text-primary" />
                                  </motion.div>
                                )}
                                <span className="text-sm font-semibold">
                                  {t("orders.orderNumber", { number: order.id.slice(0, 8) })}
                                </span>
                              </div>
                              <OrderStatusBadge status={order.status} />
                              {order.posCheckoutMode === "quick" ? (
                                <Badge variant="secondary" className="text-[10px] font-medium">
                                  {t("orders.posWalkIn")}
                                </Badge>
                              ) : null}
                              {order.posCheckoutMode === "kitchen" ? (
                                <Badge variant="outline" className="text-[10px] font-medium">
                                  {t("orders.posKitchen")}
                                </Badge>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <PriceDisplay cents={order.totalCents} className="font-medium text-foreground/80" />
                              <span className="flex items-center gap-1">
                                <span className="size-1 rounded-full bg-border" />
                                {new Date(order.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {order.items && (
                                <span className="flex items-center gap-1">
                                  <span className="size-1 rounded-full bg-border" />
                                  {t("orders.itemsCount", { count: order.items.length })}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <ActionButtons order={order} onMutate={invalidate} t={t} />
                            <ChevronRight className="size-4 text-muted-foreground/30 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function OrdersPageFallback() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersPageFallback />}>
      <OrdersPageContent />
    </Suspense>
  );
}

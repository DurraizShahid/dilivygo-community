"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  AlertTriangle,
  MessageCircle,
  Phone,
  Star,
  Loader2,
  Package,
  FileDown,
  StickyNote,
  RotateCcw,
  CheckCircle2,
  Clock,
  CircleDollarSign,
} from "lucide-react";
import {
  Button,
  buttonVariants,
  Separator,
  Skeleton,
  OrderStatusBadge,
  PriceDisplay,
  Input,
  formatPrice,
  useCurrency,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useCustomerRefundRequestsEnabled,
  useConfirm,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@dilivygo/ui";
import { cn } from "@dilivygo/ui";
import { useOrder } from "@/hooks/use-orders";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { useWSEvent } from "@/providers/ws-provider";
import { api } from "@/lib/api";
import type { Order, OrderStatus } from "@dilivygo/types";
import { addOrderItemsToCart, normalizeOrder } from "@/lib/order-utils";
import { PromoBanner } from "@/components/promo-banner";
import { RiderTrackingMap } from "@/components/map";
import { forwardGeocodeToLatLon } from "@/lib/geocode-parse";
import { useLanguage, useTranslation } from "@dilivygo/i18n";
import confetti from "canvas-confetti";
import {
  emptyOrderRatingForm,
  makeOrderRatingSchema,
  resolveTipCents,
  type OrderRatingFormInput,
} from "@/lib/schemas/order-rating";
import {
  emptyRefundRequestForm,
  makeRefundRequestSchema,
  type RefundRequestFormInput,
} from "@/lib/schemas/refund-request";

const ORDER_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Accepted" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "assigned", label: "Assigned" },
  { status: "picked_up", label: "Picked Up" },
  { status: "arrived", label: "Arrived" },
  { status: "completed", label: "Delivered" },
];

function getStepIndex(status: OrderStatus): number {
  const idx = ORDER_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

function SlaCountdown({ slaDeadline }: { slaDeadline: string }) {
  const [remaining, setRemaining] = useState("");
  const tick = useCallback(() => {
    const deadline = new Date(slaDeadline).getTime();
    const now = Date.now();
    const diff = deadline - now;
    if (diff <= 0) {
      setRemaining("Ready soon");
      return;
    }
    const mins = Math.floor(diff / 60_000);
    const secs = Math.floor((diff % 60_000) / 1000);
    setRemaining(`${mins}m ${secs}s`);
  }, [slaDeadline]);

  useEffect(() => {
    const t = setTimeout(() => tick(), 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, [tick]);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4">
      <Clock className="size-5 shrink-0 text-primary" />
      <div>
        <p className="text-sm font-semibold text-foreground">Estimated delivery</p>
        <p className="text-lg font-extrabold text-primary">{remaining}</p>
      </div>
    </div>
  );
}

function StarRating({
  value,
  onChange,
  label,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  error?: boolean;
}) {
  return (
    <div className="space-y-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              "rounded p-0.5 focus:outline-none focus:ring-2 focus:ring-ring",
              error && "ring-1 ring-destructive",
            )}
            aria-label={`${i} star${i > 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "size-8 transition-colors",
                i <= value
                  ? "fill-current text-primary"
                  : "text-muted-foreground/30 hover:text-primary/70"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function OrderDetailRatingSection({
  order,
  existingReview,
  currency,
}: {
  order: Order;
  existingReview: { rating: number; comment?: string | null } | null;
  currency: string;
}) {
  const shopNeeded = !!order.shopId && !existingReview;
  const hasRider = !!order.delivery?.riderId;
  const form = useForm<OrderRatingFormInput>({
    resolver: zodResolver(makeOrderRatingSchema({ shopNeeded, hasRider })),
    defaultValues: {
      ...emptyOrderRatingForm(),
      vendorRating: existingReview?.rating ?? 0,
      comment: existingReview?.comment ?? "",
    },
    mode: "onSubmit",
  });

  const onSubmit = form.handleSubmit(async (values) => {
    const tipAmount = resolveTipCents(values);
    try {
      if (order.shopId && values.vendorRating > 0 && !existingReview) {
        await api.reviews.create({
          orderId: order.id,
          rating: values.vendorRating,
          comment: values.comment.trim() || undefined,
        });
      }
      if (order.delivery?.riderId && values.riderRating > 0) {
        await api.ratings.create({
          orderId: order.id,
          toUserId: order.delivery.riderId,
          toRole: "rider",
          rating: values.riderRating,
          comment: values.comment.trim() || undefined,
        });
      }
      if (order.delivery?.riderId && tipAmount > 0) {
        await api.tips.create({
          orderId: order.id,
          toRiderId: order.delivery.riderId,
          amountCents: tipAmount,
        });
      }
    } catch {
    }
  });

  const submitting = form.formState.isSubmitting;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20">
          <Star className="size-4 fill-current text-primary" />
        </span>
        <h3 className="font-bold tracking-tight">Rate Your Experience</h3>
      </div>
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {order.shopId ? (
            <FormField
              control={form.control}
              name="vendorRating"
              render={({ field, fieldState }) => (
                <FormItem>
                  <StarRating
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    label="Shop"
                    error={!!fieldState.error}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
          {existingReview && (
            <p className="text-xs text-muted-foreground">
              Shop review already submitted. Additional submissions are disabled.
            </p>
          )}
          {hasRider && (
            <FormField
              control={form.control}
              name="riderRating"
              render={({ field, fieldState }) => (
                <FormItem>
                  <StarRating
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    label="Delivery / Rider"
                    error={!!fieldState.error}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold">Comment (optional)</FormLabel>
                <FormControl>
                  <textarea
                    {...field}
                    placeholder="How was your experience?"
                    rows={3}
                    className="flex w-full resize-none rounded-xl border border-input bg-transparent px-4 py-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {hasRider && (
            <FormField
              control={form.control}
              name="tipCents"
              render={({ field: tipField }) => (
                <FormItem className="space-y-2">
                  <span className="text-sm font-semibold">Tip for rider (optional)</span>
                  <FormControl>
                    <div className="flex flex-wrap gap-2">
                      {[100, 200, 500].map((c) => (
                        <Button
                          key={c}
                          type="button"
                          variant={tipField.value === c ? "default" : "outline"}
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            tipField.onChange(c);
                            form.setValue("customTipCentsInput", "", { shouldValidate: true });
                          }}
                        >
                          {formatPrice(c, currency)}
                        </Button>
                      ))}
                      <FormField
                        control={form.control}
                        name="customTipCentsInput"
                        render={({ field: customField }) => (
                          <FormItem className="flex items-center gap-1.5 space-y-0">
                            <span className="text-sm text-muted-foreground">Custom:</span>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="0"
                                className="w-20 rounded-xl"
                                min={0}
                                step={10}
                                {...customField}
                                onChange={(e) => {
                                  customField.onChange(e.target.value);
                                  form.setValue("tipCents", null, { shouldValidate: true });
                                }}
                              />
                            </FormControl>
                            <span className="text-xs text-muted-foreground">p</span>
                          </FormItem>
                        )}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <Button
            type="submit"
            className="w-full rounded-xl shadow-sm"
            disabled={submitting}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Submit Rating"}
          </Button>
        </form>
      </Form>
    </div>
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const refundConversationIdRaw = searchParams.get("conversationId");
  const refundConversationId =
    refundConversationIdRaw && UUID_RE.test(refundConversationIdRaw)
      ? refundConversationIdRaw
      : undefined;
  const { language } = useLanguage();
  const { t } = useTranslation("customer");
  const currency = useCurrency();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const cart = useCartStore();
  const [chatLoading, setChatLoading] = useState<string | null>(null);
  const [existingReview, setExistingReview] = useState<{
    rating: number;
    comment?: string | null;
  } | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const refundRequestsEnabled = useCustomerRefundRequestsEnabled();
  const queryClient = useQueryClient();

  async function downloadReceiptPdf() {
    if (!order || order.status !== "completed") return;
    setReceiptBusy(true);
    try {
      const blob = await api.orders.getReceiptPdf(order.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${order.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
    } finally {
      setReceiptBusy(false);
    }
  }

  async function handleReorder() {
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
  }

  async function navigateToChat(type: "customer_vendor" | "customer_rider") {
    if (!order) return;
    setChatLoading(type);
    try {
      const convos = await api.chat.listConversations();
      const existing = convos.find(
        (c) => c.orderId === order.id && c.type === type
      );
      if (existing) {
        router.push(`/chat/${existing.id}`);
      } else {
        const created = await api.chat.createConversation({
          orderId: order.id,
          type,
        });
        router.push(`/chat/${created.id}`);
      }
    } catch {
    } finally {
      setChatLoading(null);
    }
  }

  const [riderLocation, setRiderLocation] = useState<{
    lat: number;
    lon: number;
    heading?: number | null;
    speed?: number | null;
  } | null>(null);

  const [dropoffLocation, setDropoffLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const { data: rawOrder, isLoading } = useOrder(id);
  const order = useMemo(
    () => (rawOrder ? normalizeOrder(rawOrder) : null),
    [rawOrder]
  );
  const orderCurrency = order?.currency ? order.currency.toUpperCase() : currency;

  const refundSchema = useMemo(
    () =>
      makeRefundRequestSchema({
        totalCents: order?.totalCents ?? 0,
        reasonRequiredMessage: t("orders.refundReasonRequired"),
        invalidPartialMessage: t("orders.refundInvalidAmount"),
      }),
    [order?.totalCents, t]
  );

  const refundForm = useForm<RefundRequestFormInput>({
    resolver: zodResolver(refundSchema),
    defaultValues: emptyRefundRequestForm(),
    mode: "onSubmit",
  });

  const prevOrderStatusRef = useRef<string | null>(null);
  const prevOrderIdForStatusRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!order || !id) return;
    if (prevOrderIdForStatusRef.current !== id) {
      prevOrderIdForStatusRef.current = id;
      prevOrderStatusRef.current = null;
    }
    const prev = prevOrderStatusRef.current;
    if (order.status === "completed" && prev !== null && prev !== "completed") {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.65 } });
    }
    prevOrderStatusRef.current = order.status;
  }, [id, order]);

  const canRequestRefundStatus =
    !!order &&
    ["completed", "rejected", "cancelled"].includes(order.status) &&
    order.paymentStatus === "paid";

  const { data: refundReqPayload } = useQuery({
    queryKey: ["customer-refund-request", id],
    queryFn: () => api.orders.getRefundRequest(id as string),
    enabled: Boolean(id && refundRequestsEnabled && canRequestRefundStatus),
  });
  const refundRequest = refundReqPayload?.refundRequest ?? null;

  useWSEvent("delivery:location_update", (event) => {
    if (order?.delivery?.id && event.deliveryId === order.delivery.id) {
      setRiderLocation({
        lat: event.lat,
        lon: event.lon,
        heading: event.heading,
        speed: event.speed,
      });
    }
  });

  useEffect(() => {
    if (!order?.delivery?.id || !isAuthenticated) return;
    api.orders
      .getRiderLocation(order.id)
      .then(({ location }) => {
        setRiderLocation({
          lat: location.lat,
          lon: location.lon,
          heading: location.heading,
          speed: location.speed,
        });
      })
      .catch(() => {});
  }, [order?.delivery?.id, order?.id, isAuthenticated]);

  useEffect(() => {
    if (!order) {
      setDropoffLocation(null);
      return;
    }
    const addr = order.deliveryAddress?.trim();
    const showTrackingMap =
      !!order.delivery?.riderId &&
      ["assigned", "picked_up", "arrived"].includes(order.status);
    if (!addr || !showTrackingMap) {
      setDropoffLocation(null);
      return;
    }
    let cancelled = false;
    forwardGeocodeToLatLon(addr)
      .then((ll) => {
        if (!cancelled) setDropoffLocation(ll);
      })
      .catch(() => {
        if (!cancelled) setDropoffLocation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    order?.id,
    order?.deliveryAddress,
    order?.delivery?.riderId,
    order?.status,
  ]);

  useEffect(() => {
    if (!order?.id || !isAuthenticated) return;
    api.reviews
      .getMyOrderReview(order.id)
      .then((review) => {
        if (!review) return;
        setExistingReview({ rating: review.rating, comment: review.comment });
      })
      .catch(() => {});
  }, [order?.id, isAuthenticated]);

  if (authLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 lg:px-8">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8 lg:px-8">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border/70 bg-muted/30 px-10 py-16 text-center shadow-inner">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 text-primary">
            <Package className="size-8" />
          </div>
          <p className="mt-4 font-medium text-muted-foreground">Order not found</p>
          <Button variant="outline" className="mt-4 rounded-xl" onClick={() => router.back()}>
            Go back
          </Button>
        </div>
      </div>
    );
  }

  const currentStep = getStepIndex(order.status);
  const isCancelled = order.status === "cancelled";
  const isRejected = order.status === "rejected";
  const showSla =
    order.slaDeadline &&
    (order.status === "accepted" || order.status === "preparing");
  const showRating = order.status === "completed";
  const hasDelivery = !!order.delivery?.riderId;
  const slaOverdue = order.slaDeadline
    ? new Date(order.slaDeadline).getTime() < Date.now()
    : false;
  const isLate =
    (order.slaBreached || slaOverdue) &&
    !["completed", "cancelled", "rejected"].includes(order.status);

  const submitRefundRequest = refundForm.handleSubmit(async (values) => {
    if (!order) return;
    let partial: number | undefined;
    const raw = values.partialAmountInput.trim();
    if (raw.length) partial = Number.parseInt(raw, 10);
    try {
      await api.orders.createRefundRequest(order.id, {
        reason: values.reason.trim(),
        requestedAmountCents: partial,
        ...(refundConversationId ? { conversationId: refundConversationId } : {}),
      });
      setRefundDialogOpen(false);
      refundForm.reset(emptyRefundRequestForm());
      if (refundConversationId) {
        router.replace(`/orders/${id}`, { scroll: false });
      }
      void queryClient.invalidateQueries({ queryKey: ["customer-refund-request", id] });
      void queryClient.invalidateQueries({ queryKey: ["orders", id] });
    } catch {
    }
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">
      {confirmDialog}
      <PromoBanner placement="order_detail" />

      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground hover:shadow-md"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold tracking-tight">Order #{order.id.slice(0, 8)}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString(language, {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
          {order.status === "completed" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-xl"
              disabled={receiptBusy}
              onClick={() => void downloadReceiptPdf()}
            >
              {receiptBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              PDF receipt
            </Button>
          )}
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Scheduled notice */}
      {order.status === "scheduled" && order.scheduledFor && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4">
          <span className="text-primary text-lg">🕑</span>
          <div>
            <p className="text-sm font-bold text-foreground">Scheduled Order</p>
            <p className="text-xs text-muted-foreground">
              Will be placed at{" "}
              <span className="font-semibold">
                {new Date(order.scheduledFor).toLocaleString(language, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Rate CTA */}
      {showRating && (
        <div className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 to-primary/5 shadow-sm">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Star className="size-5 fill-current text-primary" />
              </div>
              <div>
                <p className="font-bold tracking-tight text-foreground">Rate this order</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Share a review to help others
                </p>
              </div>
            </div>
            <Link
              href={`/orders/${order.id}/rate`}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "shrink-0 rounded-xl"
              )}
            >
              Open full review
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        {/* Main content */}
        <div className="space-y-4">
          {isRejected && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-4 text-destructive">
              <p className="font-bold">Order Rejected</p>
              {order.rejectionReason && (
                <p className="mt-1 text-sm opacity-80">
                  {order.rejectionReason}
                </p>
              )}
            </div>
          )}

          {showSla && order.slaDeadline && (
            <SlaCountdown slaDeadline={order.slaDeadline} />
          )}

          {isLate && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4">
              <AlertTriangle className="size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-bold text-foreground">
                  Order is later than expected
                </p>
                <p className="text-xs text-muted-foreground">
                  The restaurant has been notified. Your order will be with you soon.
                </p>
              </div>
            </div>
          )}

          {/* Progress tracker */}
          {!isCancelled && !isRejected && (
            <div className="rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm backdrop-blur-sm">
              <h3 className="mb-5 flex items-center gap-2 text-sm font-bold text-muted-foreground">
                <Package className="size-4 text-primary" />
                Order Progress
              </h3>
              <div className="flex items-start justify-between overflow-x-auto pb-1">
                {ORDER_STEPS.map((step, idx) => (
                  <div key={step.status} className="flex flex-1 items-start">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                          idx < currentStep
                            ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                            : idx === currentStep
                              ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-4 ring-primary/15"
                              : "border-muted-foreground/20 bg-muted/30 text-muted-foreground/40"
                        )}
                      >
                        {idx < currentStep ? (
                          <CheckCircle2 className="size-4" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span
                        className={cn(
                          "mt-0.5 max-w-[52px] text-center text-[9px] leading-tight",
                          idx <= currentStep
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground/40"
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                    {idx < ORDER_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "mx-1 mt-4 h-0.5 flex-1 rounded-full transition-colors",
                          idx < currentStep ? "bg-primary" : "bg-muted/60"
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasDelivery &&
            ["assigned", "picked_up", "arrived"].includes(order.status) && (
              <RiderTrackingMap
                riderLocation={riderLocation}
                shopLocation={
                  (order as any).shop?.lat && (order as any).shop?.lon
                    ? {
                        lat: (order as any).shop.lat,
                        lon: (order as any).shop.lon,
                      }
                    : null
                }
                customerLocation={dropoffLocation}
              />
            )}

          {(order.status === "ready" ||
            (order.status === "assigned" && !order.delivery?.riderId)) && (
            <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-5 py-4">
              <div className="size-3 animate-pulse rounded-full bg-primary shadow-sm shadow-primary/50" />
              <span className="text-sm font-semibold text-primary">
                Searching for a rider near you...
              </span>
            </div>
          )}

          {order.delivery?.isExternal && (
            <div className="rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm backdrop-blur-sm">
              <p className="text-sm font-semibold">
                Your rider: {order.delivery.externalRiderName}
              </p>
              <a
                href={`tel:${order.delivery.externalRiderPhone}`}
                className="text-sm text-primary hover:underline"
              >
                Call: {order.delivery.externalRiderPhone}
              </a>
            </div>
          )}

          {/* Rating section */}
          {showRating && (
            <OrderDetailRatingSection
              key={`${order.id}-${existingReview ? "shop-reviewed" : "no-shop-review"}`}
              order={order}
              existingReview={existingReview}
              currency={orderCurrency}
            />
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Delivery notes */}
          {((order as any).deliveryNotes || (order as any).delivery_notes) && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <StickyNote className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">Delivery Instructions</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {(order as any).deliveryNotes || (order as any).delivery_notes}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Items */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm">
            <div className="border-b border-border/50 bg-primary/5 px-5 py-4">
              <div className="flex items-center gap-2">
                <Package className="size-4 text-primary" />
                <h3 className="font-bold tracking-tight">Order Items</h3>
              </div>
            </div>
            <div className="p-5">
              <div className="space-y-2">
                {order.items?.map((item) => (
                  <div key={item.id}>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.name} &times; {item.quantity}
                      </span>
                      <PriceDisplay
                        cents={item.unitPriceCents * item.quantity}
                        currency={orderCurrency}
                        className="font-semibold"
                      />
                    </div>
                    {item.modifiers?.map((mod, modIdx) => (
                      <p
                        key={mod.id || `mod-${modIdx}`}
                        className="mt-0.5 pl-1 text-xs text-muted-foreground"
                      >
                        <span className="font-medium text-muted-foreground/90">
                          {mod.groupName}:
                        </span>{" "}
                        {mod.optionName}
                        {mod.priceCents !== 0 ? (
                          <span className="text-muted-foreground/80">
                            {" "}
                            (+
                            <PriceDisplay
                              cents={mod.priceCents}
                              currency={orderCurrency}
                              className="inline text-xs text-muted-foreground/80"
                            />
                            )
                          </span>
                        ) : null}
                      </p>
                    ))}
                    {item.notes && (
                      <p className="mt-0.5 pl-1 text-xs italic text-muted-foreground/70">
                        &ldquo;{item.notes}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
                <Separator className="my-2 opacity-60" />
                <div className="flex justify-between font-extrabold">
                  <span>Total</span>
                  <PriceDisplay cents={order.totalCents} currency={orderCurrency} />
                </div>
              </div>
            </div>
          </div>

          {refundRequestsEnabled && canRequestRefundStatus && (
            <div className="rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <CircleDollarSign className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="font-bold tracking-tight">{t("orders.refundTitle")}</p>
                  {refundRequest?.status === "pending" && (
                    <p className="text-sm text-muted-foreground">{t("orders.refundPending")}</p>
                  )}
                  {refundRequest?.status === "approved" && (
                    <p className="text-sm text-muted-foreground">{t("orders.refundApproved")}</p>
                  )}
                  {refundRequest?.status === "rejected" && (
                    <p className="text-sm text-muted-foreground">{t("orders.refundRejected")}</p>
                  )}
                  {!refundRequest ||
                  refundRequest.status === "rejected" ||
                  refundRequest.status === "cancelled" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1 rounded-xl"
                      onClick={() => {
                        refundForm.reset(emptyRefundRequestForm());
                        setRefundDialogOpen(true);
                      }}
                    >
                      {t("orders.refundRequestCta")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          {!isRejected && (
            <div className="space-y-2">
              <Button
                className="w-full gap-2 rounded-xl shadow-sm"
                onClick={handleReorder}
              >
                <RotateCcw className="size-4" />
                Reorder
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 rounded-xl"
                onClick={() => navigateToChat("customer_vendor")}
                disabled={chatLoading === "customer_vendor"}
              >
                {chatLoading === "customer_vendor" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageCircle className="size-4" />
                )}
                Chat with Restaurant
              </Button>
              {hasDelivery && (
                <Button
                  variant="outline"
                  className="w-full gap-2 rounded-xl"
                  onClick={() => navigateToChat("customer_rider")}
                  disabled={chatLoading === "customer_rider"}
                >
                  {chatLoading === "customer_rider" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Phone className="size-4" />
                  )}
                  Chat with Rider
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={refundDialogOpen}
        onOpenChange={(open) => {
          setRefundDialogOpen(open);
          if (!open) refundForm.reset(emptyRefundRequestForm());
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("orders.refundDialogTitle")}</DialogTitle>
            <DialogDescription>{t("orders.refundDialogHint")}</DialogDescription>
          </DialogHeader>
          <Form {...refundForm}>
            <form onSubmit={submitRefundRequest} className="space-y-3" noValidate>
              <FormField
                control={refundForm.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">{t("orders.refundReasonLabel")}</FormLabel>
                    <FormControl>
                      <textarea
                        {...field}
                        rows={4}
                        className="flex w-full resize-none rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                        placeholder={t("orders.refundReasonPlaceholder")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={refundForm.control}
                name="partialAmountInput"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">{t("orders.refundPartialLabel")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        max={order.totalCents}
                        placeholder={t("orders.refundPartialPlaceholder", {
                          total: String(order.totalCents),
                        })}
                        className="rounded-xl"
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">
                      {t("orders.refundFullTotal")}{" "}
                      <PriceDisplay cents={order.totalCents} currency={orderCurrency} className="inline font-semibold" />
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setRefundDialogOpen(false)}
                  disabled={refundForm.formState.isSubmitting}
                >
                  {t("orders.refundCancel")}
                </Button>
                <Button type="submit" className="rounded-xl" disabled={refundForm.formState.isSubmitting}>
                  {refundForm.formState.isSubmitting ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t("orders.refundSubmit")
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Clock, Truck, AlertTriangle, TimerReset, FileDown, StickyNote, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "@dilivygo/i18n";
import { normalizeOrder } from "@dilivygo/api";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Input,
  Separator,
  Skeleton,
  OrderStatusBadge,
  PriceDisplay,
  cn,
} from "@dilivygo/ui";
import type { OrderItem, OrderStatus } from "@dilivygo/types";

type VendorLineItem = OrderItem & {
  order_item_modifiers?: Array<Record<string, unknown>>;
};

function vendorLineModifiers(item: VendorLineItem) {
  if (item.modifiers?.length) {
    return item.modifiers.map((m) => ({
      id: m.id,
      groupName: m.groupName,
      optionName: m.optionName,
      priceCents: m.priceCents,
    }));
  }
  const raw = item.order_item_modifiers;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => ({
    id: String(row.id ?? ""),
    groupName: String(row.group_name ?? row.groupName ?? ""),
    optionName: String(row.option_name ?? row.optionName ?? ""),
    priceCents: Number(row.price_cents ?? row.priceCents ?? 0),
  }));
}
import { useOrder } from "@/hooks/use-orders";
import { api } from "@/lib/api";
import { useSLATimer } from "@/hooks/use-sla-timer";

/** Matches server `extendSlaSchema`: additionalMinutes 5–60. */
const SLA_EXTEND_PRESET_MINUTES = [5, 10, 15, 20, 30, 45, 60] as const;

const VENDOR_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "placed", label: "Placed" },
  { status: "accepted", label: "Accepted" },
  { status: "preparing", label: "Preparing" },
  { status: "ready", label: "Ready" },
  { status: "assigned", label: "Rider" },
  { status: "picked_up", label: "Picked Up" },
  { status: "arrived", label: "Arrived" },
  { status: "completed", label: "Completed" },
];

function getStepIndex(status: OrderStatus): number {
  const idx = VENDOR_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

function extendPresetLoadingLabel(mins: number) {
  return `Extended +${mins}m`;
}

function isSlaPastOrBreached(
  slaDeadline: string | undefined | null,
  slaBreached: boolean | undefined,
  remainingSeconds: number | null,
): boolean {
  if (!slaDeadline) return false;
  if (slaBreached) return true;
  if (remainingSeconds !== null) return remainingSeconds <= 0;
  return new Date(slaDeadline).getTime() <= Date.now();
}

function SlaExtendPresetButtons({
  loading,
  onPreset,
  variant = "secondary",
  className,
}: {
  loading: string | null;
  onPreset: (mins: number) => void;
  variant?: "secondary" | "outline";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {SLA_EXTEND_PRESET_MINUTES.map((mins) => {
        const label = extendPresetLoadingLabel(mins);
        return (
          <Button
            key={mins}
            type="button"
            size="sm"
            variant={variant}
            className="min-w-[4.25rem]"
            disabled={!!loading}
            onClick={() => onPreset(mins)}
          >
            {loading === label ? <Loader2 className="size-4 animate-spin" /> : `+${mins} min`}
          </Button>
        );
      })}
    </div>
  );
}

export default function OrderDetailPage() {
  const { t } = useTranslation("vendor");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: order, isLoading } = useOrder(id);
  const [loading, setLoading] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState("10");
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [receiptBusy, setReceiptBusy] = useState(false);

  const slaRemaining = useSLATimer(order?.slaDeadline ?? null);

  async function downloadReceiptPdf() {
    if (!order) return;
    setReceiptBusy(true);
    try {
      const blob = await api.orders.getReceiptPdf(order.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${order.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Receipt downloaded");
    } catch {
      toast.error("Could not download receipt");
    } finally {
      setReceiptBusy(false);
    }
  }

  async function handleAction(action: () => Promise<unknown>, label: string) {
    setLoading(label);
    try {
      const result = await action();
      const payload =
        result && typeof result === "object" && "order" in result
          ? (result as { order?: unknown }).order
          : result;
      const normalized = normalizeOrder(payload);
      if (normalized) {
        const detail = { ...normalized, items: normalized.items ?? [] };
        queryClient.setQueryData(["orders", id], detail);
        queryClient.setQueriesData({
          queryKey: ["orders"],
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            q.queryKey[0] === "orders" &&
            q.queryKey.length === 3,
        }, (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((o) => (o.id === normalized.id ? { ...o, ...normalized } : o));
        });
      }
      toast.success(`Order ${label.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders", id] });
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : `Failed to ${label.toLowerCase()}`;
      toast.error(message);
    } finally {
      setLoading(null);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl text-center py-16">
        <p className="text-muted-foreground">Order not found</p>
      </div>
    );
  }

  const currentStep = getStepIndex(order.status);
  const isCancelled = order.status === "cancelled";
  const isRejected = order.status === "rejected";
  const isTerminal = isCancelled || isRejected;

  const canExtendSla = order.status === "accepted" || order.status === "preparing";
  const slaPastOrBreached = isSlaPastOrBreached(
    order.slaDeadline,
    order.slaBreached,
    slaRemaining,
  );
  const showExtendPresetsInSlaBanner =
    canExtendSla && Boolean(order.slaDeadline) && slaPastOrBreached;

  const slaSecondsLeft =
    order.slaDeadline == null
      ? null
      : slaRemaining !== null
        ? slaRemaining
        : Math.floor(
            (new Date(order.slaDeadline).getTime() - Date.now()) / 1000,
          );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" /> Back to orders
      </button>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Order #{order.id.slice(0, 8)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
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

      {/* SLA Timer */}
      {order.slaDeadline && !isTerminal && (
        <Card className={cn(
          "shadow-sm border-border/60",
          slaPastOrBreached ? "border-destructive/50 bg-destructive/5" : "bg-amber-50/50"
        )}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                slaPastOrBreached ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-600"
              )}>
                <Clock className="size-4" />
              </div>
              <div className="min-w-0 flex-1 text-sm">
                {slaSecondsLeft !== null && slaSecondsLeft > 0 ? (
                  <span>
                    SLA deadline in{" "}
                    <span className="font-semibold tabular-nums">
                      {Math.floor(slaSecondsLeft / 60)}m {slaSecondsLeft % 60}s
                    </span>
                  </span>
                ) : (
                  <span className="text-destructive font-medium">
                    {order.slaBreached ? "SLA deadline breached" : "SLA deadline passed"}
                  </span>
                )}
              </div>
            </div>
            {showExtendPresetsInSlaBanner && (
              <div className="border-t border-destructive/20 pt-3 dark:border-destructive/30">
                <p className="mb-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <TimerReset className="size-3.5 shrink-0" />
                  Add prep time (customer notified)
                </p>
                <SlaExtendPresetButtons
                  loading={loading}
                  variant="outline"
                  className="[&_button]:border-destructive/25 [&_button]:bg-background/80"
                  onPreset={(mins) =>
                    void handleAction(
                      () => api.orders.extendSla(order.id, mins),
                      extendPresetLoadingLabel(mins),
                    )
                  }
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Progress steps */}
      {!isTerminal && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              {VENDOR_STEPS.map((step, idx) => (
                <div key={step.status} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                        idx <= currentStep
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      {idx + 1}
                    </div>
                    <span
                      className={cn(
                        "mt-1.5 text-[10px] leading-tight text-center",
                        idx <= currentStep
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {idx < VENDOR_STEPS.length - 1 && (
                    <div
                      className={cn(
                        "mx-1 h-0.5 flex-1 rounded-full",
                        idx < currentStep ? "bg-primary" : "bg-border"
                      )}
                    />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      {!isTerminal && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="flex flex-wrap gap-2 p-4">
            {order.status === "placed" && (
              <>
                <Button
                  disabled={!!loading}
                  onClick={() => handleAction(() => api.orders.accept(order.id), "Accepted")}
                >
                  {loading === "Accepted" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Accept Order
                </Button>
                <Button
                  variant="destructive"
                  disabled={!!loading}
                  onClick={() => setShowRejectForm(!showRejectForm)}
                >
                  Reject
                </Button>
              </>
            )}
            {order.status === "accepted" && (
              <Button
                disabled={!!loading}
                onClick={() => handleAction(() => api.orders.updateStatus(order.id, "preparing"), "Started preparing")}
              >
                {loading === "Started preparing" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Start Preparing
              </Button>
            )}
            {order.status === "preparing" && (
              <Button
                disabled={!!loading}
                onClick={() => handleAction(() => api.orders.updateStatus(order.id, "ready"), "Marked ready")}
              >
                {loading === "Marked ready" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Mark Ready
              </Button>
            )}
            {order.status === "ready" && order.posCheckoutMode === "kitchen" && (
              <Button
                disabled={!!loading}
                onClick={() =>
                  handleAction(() => api.orders.updateStatus(order.id, "completed"), "Marked completed")
                }
              >
                {loading === "Marked completed" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {t("orders.markPosCompleted")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reject form */}
      {showRejectForm && order.status === "placed" && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium">Reason for rejection</p>
            <Input
              placeholder="e.g. Out of stock, kitchen closed..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={!!loading}
                onClick={() =>
                  handleAction(
                    () => api.orders.reject(order.id, rejectReason || undefined),
                    "Rejected"
                  )
                }
              >
                {loading === "Rejected" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Confirm Reject
              </Button>
              <Button variant="outline" onClick={() => setShowRejectForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rejection / cancellation notice */}
      {isRejected && order.rejectionReason && (
        <Card className="border-destructive/50 bg-destructive/5 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-destructive">Rejected</p>
              <p className="text-sm text-muted-foreground mt-0.5">{order.rejectionReason}</p>
            </div>
          </CardContent>
        </Card>
      )}
      {isCancelled && order.cancellationReason && (
        <Card className="border-destructive/50 bg-destructive/5 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            <div>
              <p className="text-sm font-medium text-destructive">Cancelled</p>
              <p className="text-sm text-muted-foreground mt-0.5">{order.cancellationReason}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items */}
      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {order.items?.map((item) => {
            const line = item as VendorLineItem;
            const mods = vendorLineModifiers(line);
            return (
            <div key={item.id}>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.name} &times; {item.quantity}
                </span>
                <PriceDisplay cents={item.unitPriceCents * item.quantity} />
              </div>
              {mods.map((mod, modIdx) => (
                <p
                  key={mod.id || `mod-${modIdx}`}
                  className="mt-1 pl-1 text-sm font-medium text-amber-800 dark:text-amber-200"
                >
                  <span className="text-amber-700 dark:text-amber-300">{mod.groupName}:</span>{" "}
                  {mod.optionName}
                  {mod.priceCents !== 0 ? (
                    <span className="ml-1 font-semibold tabular-nums text-amber-900 dark:text-amber-100">
                      (+
                      <PriceDisplay
                        cents={mod.priceCents}
                        className="inline text-sm font-semibold text-amber-900 dark:text-amber-100"
                      />
                      )
                    </span>
                  ) : null}
                </p>
              ))}
              {item.notes && (
                <p className="mt-0.5 text-xs italic text-amber-600 dark:text-amber-400 pl-1">
                  Note: {item.notes}
                </p>
              )}
            </div>
            );
          })}
          <Separator />
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <PriceDisplay cents={order.totalCents} />
          </div>
        </CardContent>
      </Card>

      {/* Delivery notes */}
      {((order as any).deliveryNotes || (order as any).delivery_notes) && (
        <Card className="shadow-sm border-border/60 border-amber-200/60 bg-amber-50/30 dark:border-amber-800/40 dark:bg-amber-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
              <StickyNote className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Delivery Instructions</p>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                {(order as any).deliveryNotes || (order as any).delivery_notes}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {order.cutleryRequested && (
        <Card className="shadow-sm border-border/60 border-teal-200/60 bg-teal-50/30 dark:border-teal-800/40 dark:bg-teal-950/20">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-100 dark:bg-teal-900/40">
              <UtensilsCrossed className="size-4 text-teal-700 dark:text-teal-300" />
            </div>
            <div>
              <p className="text-sm font-medium text-teal-900 dark:text-teal-100">{t("orders.cutleryRequestedTitle")}</p>
              <p className="text-sm text-teal-800 dark:text-teal-200 mt-0.5">
                {(order.cutleryFeeCents ?? 0) > 0 ? (
                  <>
                    {t("orders.cutleryRequestedFeeLead")}{" "}
                    <PriceDisplay cents={order.cutleryFeeCents ?? 0} className="inline font-semibold" />
                  </>
                ) : (
                  t("orders.cutleryRequestedNoFee")
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order meta */}
      <Card className="shadow-sm border-border/60">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Order ID</span>
            <span className="font-mono text-xs text-muted-foreground">{order.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span>{order.customerId.slice(0, 8)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Placed at</span>
            <span>{new Date(order.createdAt).toLocaleString()}</span>
          </div>
          {order.prepTimeMinutes && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Prep time</span>
              <span>{order.prepTimeMinutes} min</span>
            </div>
          )}
          {order.deliveryMode && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery mode</span>
              <span className="capitalize">{order.deliveryMode.replace(/_/g, " ")}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment</span>
            <span className="capitalize">{order.paymentStatus}</span>
          </div>
        </CardContent>
      </Card>

      {/* Delivery status */}
      {order.deliveryMode && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Truck className="size-4" />
            </div>
            <div className="text-sm">
              <p className="font-medium">Delivery</p>
              <p className="text-muted-foreground capitalize">
                {order.deliveryMode.replace(/_/g, " ")} delivery
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extend SLA */}
      {canExtendSla && (
        <Card className="shadow-sm border-border/60">
          <CardContent className="space-y-3 p-4">
            <p className="text-sm font-medium flex items-center gap-2">
              <TimerReset className="size-4 text-muted-foreground" /> Extend Prep Time
            </p>
            <p className="text-xs text-muted-foreground">
              {showExtendPresetsInSlaBanner
                ? "Quick-add is also shown above on the SLA card. Custom amounts below."
                : "Add time to the kitchen SLA. Customer is notified after each extension."}
            </p>
            {!showExtendPresetsInSlaBanner && (
              <SlaExtendPresetButtons
                loading={loading}
                onPreset={(mins) =>
                  void handleAction(
                    () => api.orders.extendSla(order.id, mins),
                    extendPresetLoadingLabel(mins),
                  )
                }
              />
            )}
            <div className="flex items-center justify-between gap-2 pt-1">
              {!showExtendForm ? (
                <Button size="sm" variant="outline" onClick={() => setShowExtendForm(true)}>
                  Custom amount
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">5–60 minutes</span>
              )}
            </div>
            {showExtendForm && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] flex-1 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Additional minutes</label>
                  <Input
                    type="number"
                    min={5}
                    max={60}
                    value={extendMinutes}
                    onChange={(e) => setExtendMinutes(e.target.value)}
                  />
                </div>
                <Button
                  disabled={!!loading}
                  onClick={() => {
                    const parsed = parseInt(extendMinutes, 10);
                    const clamped =
                      Number.isFinite(parsed) ? Math.min(60, Math.max(5, parsed)) : 10;
                    void handleAction(
                      () => api.orders.extendSla(order.id, clamped),
                      "Extended SLA"
                    ).then(() => setShowExtendForm(false));
                  }}
                >
                  {loading === "Extended SLA" ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Confirm
                </Button>
                <Button variant="outline" onClick={() => setShowExtendForm(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

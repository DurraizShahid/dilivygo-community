"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast as sonnerToast } from "sonner";
import { Bell, Loader2, X } from "lucide-react";
import { useTranslation } from "@dilivygo/i18n";
import { Button, cn } from "@dilivygo/ui";
import { api } from "@/lib/api";

type Props = {
  toastId: string | number;
  orderId: string;
};

function errMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

/**
 * Rich new-order toast: readable copy, pulsing border/glow, Accept / Reject / View.
 */
export function VendorNewOrderToastContent({ toastId, orderId }: Props) {
  const { t } = useTranslation("vendor");
  const router = useRouter();
  const queryClient = useQueryClient();
  const shortId = orderId.slice(0, 8).toUpperCase();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);

  function dismiss() {
    sonnerToast.dismiss(toastId);
  }

  async function onAccept() {
    setBusy("accept");
    try {
      await api.orders.accept(orderId);
      dismiss();
      sonnerToast.success(t("orders.toastAccepted"), {
        description: t("orders.newOrderToastAcceptedHint", { id: shortId }),
      });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      sonnerToast.error(errMessage(err, t("orders.toastFailed")));
    } finally {
      setBusy(null);
    }
  }

  async function onReject() {
    setBusy("reject");
    try {
      await api.orders.reject(orderId);
      dismiss();
      sonnerToast.message(t("orders.toastRejected"), {
        description: t("orders.newOrderToastRejectedHint", { id: shortId }),
      });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      sonnerToast.error(errMessage(err, t("orders.toastFailed")));
    } finally {
      setBusy(null);
    }
  }

  function onView() {
    dismiss();
    router.push(`/orders/${orderId}`);
  }

  return (
    <div
      className={cn(
        "vendor-new-order-toast-shell relative w-[min(100vw-2rem,22rem)] overflow-hidden rounded-3xl border p-4 text-left",
        "border-primary/25 bg-card text-card-foreground shadow-[0_16px_48px_rgba(0,0,0,0.55)]",
      )}
      role="alert"
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-br from-card via-card to-muted/40"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/12 blur-2xl vendor-new-order-toast-bloom"
        aria-hidden
      />

      <div className="relative flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
          <Bell className="size-5" strokeWidth={2.25} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="inline-flex items-center rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              {t("orders.newOrderToastKicker")}
            </span>
            <button
              type="button"
              className={cn(
                "shrink-0 rounded-xl p-1.5 text-muted-foreground transition",
                "hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
              aria-label={t("orders.newOrderToastDismiss")}
              onClick={dismiss}
            >
              <X className="size-4" />
            </button>
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-tight tracking-tight text-foreground">
            {t("orders.newOrderToastHeadline", { id: shortId })}
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            {t("orders.newOrderToastBody")}
          </p>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!!busy}
          onClick={(e) => {
            e.preventDefault();
            void onAccept();
          }}
        >
          {busy === "accept" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("orders.accept")}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="destructive"
          className="w-full"
          disabled={!!busy}
          onClick={(e) => {
            e.preventDefault();
            void onReject();
          }}
        >
          {busy === "reject" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("orders.reject")}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="w-full"
          disabled={!!busy}
          onClick={onView}
        >
          {t("orders.newOrderToastOpen")}
        </Button>
      </div>
    </div>
  );
}

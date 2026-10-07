"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  type ElementType,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import {
  ArrowLeft,
  Loader2,
  CreditCard,
  AlertTriangle,
  MapPin,
  ShoppingBag,
  Shield,
  Check,
  Ticket,
  X,
  Clock,
  CalendarClock,
  StickyNote,
  Receipt,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import {
  AnimatedList,
  Button,
  Input,
  Textarea,
  Separator,
  PriceDisplay,
  useCurrency,
  cn,
  useDeliveryFeeConfig,
  computeDeliveryFee,
  formatPrice,
  useMultiShopCartEnabled,
  useCustomerCutleryEnabled,
  useCustomerWalletEnabled,
  Switch,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@dilivygo/ui";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { useLocationStore } from "@/stores/location-store";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatCustomerAddressLine } from "@/lib/customer-address";
import { stripePromise } from "@/lib/stripe";
import type { DeliveryCheck } from "@dilivygo/types";
import { PromoBanner } from "@/components/promo-banner";
import { useLanguage } from "@dilivygo/i18n";
import { loginPathWithWorkspaceRef } from "@/lib/workspace-ref";
import { buildCheckoutDraftGroups } from "@/lib/checkout-draft";
import {
  checkoutReviewSchema,
  emptyCheckoutReview,
  type CheckoutReviewInput,
} from "@/lib/schemas/checkout-review";

// ─── Payment Form (rendered inside <Elements>) ────────────────────────────────

function PaymentForm({
  total,
  currency,
  onSuccess,
  onCancel,
}: {
  total: number;
  currency: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const currencyCode = currency;
  const [confirming, setConfirming] = useState(false);
  const [ready, setReady] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setPaymentError(null);
    setConfirming(true);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/orders`,
      },
      redirect: "if_required",
    });

    if (error) {
      setPaymentError(error.message ?? "Payment failed");
      setConfirming(false);
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleConfirm} className="space-y-6">
      <PaymentElement
        onReady={() => setReady(true)}
        options={{
          layout: "tabs",
        }}
      />

      {paymentError ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p className="font-semibold">{paymentError}</p>
        </div>
      ) : null}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1 rounded-xl"
          onClick={() => {
            setPaymentError(null);
            onCancel();
          }}
          disabled={confirming}
        >
          Back
        </Button>
        <Button
          type="submit"
          className="flex-1 gap-2 rounded-xl shadow-md shadow-primary/20"
          size="lg"
          disabled={!stripe || !ready || confirming}
        >
          {confirming ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <>
              <Check className="size-4" />
              Confirm <PriceDisplay cents={total} currency={currencyCode} className="text-primary-foreground" />
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="size-3" />
        Secure payment powered by Stripe
      </div>
    </form>
  );
}

/** Module-scoped so identity is stable across CheckoutPage re-renders (avoids remounting inputs on every keystroke). */
function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: ElementType;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-3 border-b border-border/50 bg-primary/5 px-6 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/15">
          <Icon className="size-4 text-primary" />
        </div>
        <div>
          <p className="font-bold leading-none tracking-tight">{title}</p>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Main Checkout Page ────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { language } = useLanguage();
  const {
    items,
    totalCents,
    clear,
    projectRef,
    shopId,
    currency: cartCurrency,
    checkoutPromo,
    setCheckoutPromo,
    clearCheckoutPromo,
  } = useCartStore();
  const multiShopCartEnabled = useMultiShopCartEnabled();
  const customerWalletEnabled = useCustomerWalletEnabled();
  /** Server batch + wallet flows require checkout draft (multi-shop or wallet top-up / apply). */
  const useCheckoutDraftFlow = multiShopCartEnabled || customerWalletEnabled;
  const customerCutleryEnabled = useCustomerCutleryEnabled();
  const draftGroups = useMemo(() => {
    try {
      return buildCheckoutDraftGroups(items, { shopId, projectRef });
    } catch {
      return [];
    }
  }, [items, shopId, projectRef]);
  const useGroupedMin = useCheckoutDraftFlow && draftGroups.length > 0;
  const { isAuthenticated, customer, logout } = useAuthStore();
  const platformCurrency = useCurrency();
  const currencyCode = cartCurrency || platformCurrency;
  const [loading, setLoading] = useState(false);
  const checkoutForm = useForm<CheckoutReviewInput>({
    resolver: zodResolver(checkoutReviewSchema),
    defaultValues: emptyCheckoutReview,
    mode: "onSubmit",
  });
  const watchedAddress = checkoutForm.watch("address");
  const watchedScheduleMode = checkoutForm.watch("scheduleMode");
  const watchedScheduledDate = checkoutForm.watch("scheduledDate");
  const watchedScheduledTime = checkoutForm.watch("scheduledTime");
  const watchedPromoCode = checkoutForm.watch("promoCode");
  const watchedDeliveryNotes = checkoutForm.watch("deliveryNotes");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const { data: addressData } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => api.addresses.list(),
    enabled: isAuthenticated,
  });
  const savedAddresses = useMemo(() => addressData?.addresses ?? [], [addressData?.addresses]);

  const minQueries = useQueries({
    queries: draftGroups.map((g) => ({
      queryKey: ["shop-detail", g.projectRef, g.shopId],
      queryFn: () => api.public.shopDetail(g.projectRef, g.shopId),
      enabled: useGroupedMin,
    })),
  });

  const { data: shopData } = useQuery({
    queryKey: ["shop-detail", projectRef, shopId],
    queryFn: () => api.public.shopDetail(projectRef!, shopId!),
    enabled: !!projectRef && !!shopId && !useGroupedMin,
  });
  const minimumOrderCents = shopData?.minimumOrderCents ?? 0;
  const belowMinimum = useGroupedMin
    ? minQueries.some((q, i) => {
        const min = q.data?.minimumOrderCents ?? 0;
        const sub = draftGroups[i]?.subtotalCents ?? 0;
        return min > 0 && sub < min;
      })
    : minimumOrderCents > 0 && totalCents() < minimumOrderCents;

  useEffect(() => {
    if (savedAddresses.length && !watchedAddress?.trim() && !selectedAddressId) {
      const def = savedAddresses.find((a) => a.isDefault) || savedAddresses[0];
      if (def) {
        setSelectedAddressId(def.id);
        checkoutForm.setValue("address", formatCustomerAddressLine(def));
      }
    }
  }, [savedAddresses, watchedAddress, selectedAddressId, checkoutForm]);

  const locationStoreAddress = useLocationStore((s) => s.address);
  useEffect(() => {
    if (!checkoutForm.getValues("address")?.trim() && !selectedAddressId && locationStoreAddress) {
      checkoutForm.setValue("address", locationStoreAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [deliveryCheck, setDeliveryCheck] = useState<DeliveryCheck | null>(null);
  /** When multi-shop: parallel shop delivery checks (null = not run yet / in flight). */
  const [multiDeliveryChecks, setMultiDeliveryChecks] = useState<DeliveryCheck[] | null>(null);
  const [checkingDelivery, setCheckingDelivery] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingPaymentIntentId, setPendingPaymentIntentId] = useState<string | null>(null);
  const [orderPlaced, setOrderPlaced] = useState(false);

  const [wantsCutlerySingle, setWantsCutlerySingle] = useState(false);
  const [cutleryByShopKey, setCutleryByShopKey] = useState<Record<string, boolean>>({});

  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const promoApplied = checkoutPromo;

  const { data: walletData } = useQuery({
    queryKey: ["customer-wallet"],
    queryFn: () => api.customerWallet.get(),
    enabled: isAuthenticated && customerWalletEnabled,
  });
  const walletBalanceCents = walletData?.balanceCents ?? 0;
  const [walletApplyCents, setWalletApplyCents] = useState(0);

  async function handleApplyPromo() {
    const rawPromo = checkoutForm.getValues("promoCode");
    if (!rawPromo.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    try {
      const result = await api.promoCodes.validate({
        code: rawPromo.trim(),
        shopId:
          multiShopCartEnabled && draftGroups.length !== 1 ? undefined : (shopId ?? undefined),
        subtotalCents: totalCents(),
        deliveryFeeCents: deliveryFee,
      });
      if (result.valid && result.promoCodeId) {
        setCheckoutPromo({
          code: rawPromo.trim().toUpperCase(),
          discountCents: result.discountCents,
          freeDelivery: result.freeDelivery,
          promoCodeId: result.promoCodeId,
        });
        setPromoError("");
      } else {
        setPromoError(result.message || "Invalid promo code");
        clearCheckoutPromo();
      }
    } catch (err: unknown) {
      setPromoError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to validate"
      );
      clearCheckoutPromo();
    } finally {
      setPromoLoading(false);
    }
  }

  function clearPromo() {
    clearCheckoutPromo();
    checkoutForm.setValue("promoCode", "");
    setPromoError("");
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!watchedAddress.trim()) {
      setDeliveryCheck(null);
      setMultiDeliveryChecks(null);
      return;
    }
    if (multiShopCartEnabled && draftGroups.length > 0) {
      debounceRef.current = setTimeout(async () => {
        setCheckingDelivery(true);
        setMultiDeliveryChecks(null);
        try {
          const geo = await api.public.geocode(watchedAddress.trim());
          if (geo.lat == null || geo.lon == null) {
            setMultiDeliveryChecks([]);
            setCheckingDelivery(false);
            return;
          }
          const checks = await Promise.all(
            draftGroups.map((g) =>
              api.public.shopDeliveryCheck(g.projectRef, g.shopId, geo.lat!, geo.lon!)
            )
          );
          setMultiDeliveryChecks(checks);
        } catch {
          setMultiDeliveryChecks([]);
        } finally {
          setCheckingDelivery(false);
        }
      }, 800);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
    if (!projectRef) {
      setDeliveryCheck(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setCheckingDelivery(true);
      try {
        const geo = await api.public.geocode(watchedAddress.trim());
        if (geo.lat == null || geo.lon == null) {
          setDeliveryCheck(null);
          setCheckingDelivery(false);
          return;
        }
        const check = shopId
          ? await api.public.shopDeliveryCheck(projectRef, shopId, geo.lat, geo.lon)
          : await api.public.deliveryCheck(projectRef, geo.lat, geo.lon);
        setDeliveryCheck(check);
      } catch {
        setDeliveryCheck(null);
      } finally {
        setCheckingDelivery(false);
      }
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [watchedAddress, projectRef, shopId, multiShopCartEnabled, draftGroups]);

  const feeConfig = useDeliveryFeeConfig();
  const deliveryFee = computeDeliveryFee(feeConfig, totalCents());
  const effectiveDeliveryFee = promoApplied?.freeDelivery ? 0 : deliveryFee;
  const discount = promoApplied?.discountCents ?? 0;
  const cutlerySumCents = useMemo(() => {
    if (!customerCutleryEnabled) return 0;
    if (useGroupedMin) {
      let sum = 0;
      draftGroups.forEach((g, i) => {
        const detail = minQueries[i]?.data;
        if (!detail?.cutleryOffered) return;
        const key = `${g.projectRef}::${g.shopId}`;
        if (cutleryByShopKey[key]) {
          sum += detail.cutleryFeeCents ?? 0;
        }
      });
      return sum;
    }
    if (!shopData?.cutleryOffered) return 0;
    return wantsCutlerySingle ? (shopData.cutleryFeeCents ?? 0) : 0;
  }, [
    customerCutleryEnabled,
    useGroupedMin,
    draftGroups,
    minQueries,
    shopData,
    cutleryByShopKey,
    wantsCutlerySingle,
  ]);
  const total = Math.max(totalCents() - discount + effectiveDeliveryFee + cutlerySumCents, 0);

  const effectiveWalletApply = useMemo(() => {
    if (!customerWalletEnabled || !useCheckoutDraftFlow) return 0;
    const cap = Math.min(walletBalanceCents, total);
    return Math.min(Math.max(0, walletApplyCents), cap);
  }, [customerWalletEnabled, useCheckoutDraftFlow, walletApplyCents, walletBalanceCents, total]);

  const stripeChargeCents = useMemo(
    () => Math.max(0, total - effectiveWalletApply),
    [total, effectiveWalletApply],
  );

  useEffect(() => {
    if (!customerWalletEnabled || !useCheckoutDraftFlow) {
      setWalletApplyCents(0);
      return;
    }
    const cap = Math.min(walletBalanceCents, total);
    setWalletApplyCents((prev) => Math.min(prev, cap));
  }, [customerWalletEnabled, useCheckoutDraftFlow, walletBalanceCents, total]);

  const cannotDeliver =
    multiShopCartEnabled && draftGroups.length > 0
      ? Array.isArray(multiDeliveryChecks) &&
        multiDeliveryChecks.length === draftGroups.length &&
        multiDeliveryChecks.some((c) => !c.deliverable)
      : deliveryCheck !== null && !deliveryCheck.deliverable;

  const deliveryCheckPending =
    multiShopCartEnabled && draftGroups.length > 0 && watchedAddress.trim().length > 0
      ? multiDeliveryChecks === null && checkingDelivery
      : false;

  const cartProjectRefs = useMemo(
    () => [...new Set(items.map((i) => i.projectRef ?? projectRef).filter(Boolean))] as string[],
    [items, projectRef]
  );
  const workspaceMismatch =
    isAuthenticated &&
    !!customer?.projectRef &&
    cartProjectRefs.length > 0 &&
    cartProjectRefs.some((r) => r !== customer.projectRef);

  const submitCheckout = checkoutForm.handleSubmit(async (values) => {
    setCheckoutError("");
    if (!isAuthenticated) {
      router.push(loginPathWithWorkspaceRef(projectRef ?? undefined));
      return;
    }
    if (workspaceMismatch) {
      router.push(loginPathWithWorkspaceRef(projectRef ?? undefined));
      return;
    }

    setLoading(true);
    try {
      const addrTrim = values.address.trim();
      const notesTrim = values.deliveryNotes.trim();
      const intentPayload = useCheckoutDraftFlow
        ? {
            amountCents: stripeChargeCents,
            currency: currencyCode.toLowerCase(),
            ...(customerWalletEnabled && effectiveWalletApply > 0
              ? { walletAmountCents: effectiveWalletApply }
              : {}),
            checkoutDraft: {
              groups: buildCheckoutDraftGroups(items, { shopId, projectRef }).map((g, i) => ({
                ...g,
                wantsCutlery: Boolean(
                  customerCutleryEnabled &&
                    cutleryByShopKey[`${g.projectRef}::${g.shopId}`] &&
                    minQueries[i]?.data?.cutleryOffered,
                ),
              })),
              deliveryFeeCents: deliveryFee,
              address: addrTrim,
              notes: notesTrim ? notesTrim : null,
              scheduledFor:
                values.scheduleMode === "later" && values.scheduledDate && values.scheduledTime
                  ? new Date(`${values.scheduledDate}T${values.scheduledTime}`).toISOString()
                  : null,
              promoCode: promoApplied?.code ?? null,
            },
          }
        : (() => {
            const serializedItems = JSON.stringify(
              items.map((i) => ({
                productId: i.productId,
                name: i.name,
                quantity: i.quantity,
                unitPriceCents: i.unitPriceCents,
                ...(i.productVariantId ? { productVariantId: i.productVariantId } : {}),
                ...(i.notes ? { notes: i.notes } : {}),
                ...(i.selectedModifiers?.length
                  ? {
                      modifiers: i.selectedModifiers.map((m) => ({
                        modifierOptionId: m.modifierOptionId,
                        groupName: m.groupName,
                        optionName: m.optionName,
                        priceCents: m.priceCents,
                      })),
                    }
                  : {}),
              }))
            );

            const metadata: Record<string, string> = {
              customerId: customer?.id ?? "",
              shopId: shopId ?? "",
              totalCents: String(totalCents()),
              subtotalCents: String(totalCents()),
              deliveryFeeCents: String(effectiveDeliveryFee),
              currency: currencyCode.toLowerCase(),
              address: addrTrim,
              items: serializedItems,
            };
            if (notesTrim) {
              metadata.notes = notesTrim;
            }
            if (promoApplied) {
              metadata.promoCode = promoApplied.code;
            }
            if (values.scheduleMode === "later" && values.scheduledDate && values.scheduledTime) {
              metadata.scheduledFor = new Date(`${values.scheduledDate}T${values.scheduledTime}`).toISOString();
            }
            if (customerCutleryEnabled && shopData?.cutleryOffered && wantsCutlerySingle) {
              metadata.wantsCutlery = "1";
            } else {
              metadata.wantsCutlery = "0";
            }
            return {
              amountCents: total,
              currency: currencyCode.toLowerCase(),
              metadata,
            };
          })();

      const {
        clientSecret: secret,
        isDummy,
        orderId,
        paymentIntentId,
        isWalletOnly,
      } = await api.payments.createIntent(intentPayload);

      if (isWalletOnly && paymentIntentId) {
        setPendingPaymentIntentId(paymentIntentId);
        setOrderPlaced(true);
        clear();
        void queryClient.invalidateQueries({ queryKey: ["customer-wallet"] });
        try {
          const orderList = await api.orders.list({ limit: 8 });
          const match = orderList.find((o) => o.paymentIntentId === paymentIntentId);
          if (match) {
            router.push(`/orders/${match.id}`);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
          const retried = await api.orders.list({ limit: 8 });
          const retryMatch = retried.find((o) => o.paymentIntentId === paymentIntentId);
          if (retryMatch) {
            router.push(`/orders/${retryMatch.id}`);
            return;
          }
        } catch {
          /* fall through */
        }
        router.push("/orders");
        return;
      }

      if (paymentIntentId) {
        setPendingPaymentIntentId(paymentIntentId);
      }

      if (isDummy) {
        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[Checkout] Dummy payment mode active - Stripe is not configured. " +
            "This bypass is only available in development."
          );
          setOrderPlaced(true);
          clear();
          router.push(orderId ? `/orders/${orderId}` : "/orders");
          return;
        } else {
          setCheckoutError("Payment is not configured. Please contact support.");
          return;
        }
      }

      if (!secret) {
        setCheckoutError("Could not start payment. Please try again.");
        return;
      }

      setClientSecret(secret);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : "Failed to initiate payment";
      setCheckoutError(message);
    } finally {
      setLoading(false);
    }
  });

  async function handlePaymentSuccess() {
    setOrderPlaced(true);
    clear();
    void queryClient.invalidateQueries({ queryKey: ["customer-wallet"] });

    if (pendingPaymentIntentId) {
      try {
        const orders = await api.orders.list({ limit: 5 });
        const match = orders.find((o) => o.paymentIntentId === pendingPaymentIntentId);
        if (match) {
          router.push(`/orders/${match.id}`);
          return;
        }
        // Give the Stripe webhook up to 1.5s to create the order
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const retried = await api.orders.list({ limit: 5 });
        const retryMatch = retried.find((o) => o.paymentIntentId === pendingPaymentIntentId);
        if (retryMatch) {
          router.push(`/orders/${retryMatch.id}`);
          return;
        }
      } catch {
        // fall through to list page
      }
    }

    router.push("/orders");
  }

  const emptyCartNoPayment = items.length === 0 && !clientSecret && !orderPlaced;

  useEffect(() => {
    if (!emptyCartNoPayment) return;
    router.push("/cart");
  }, [emptyCartNoPayment, router]);

  if (emptyCartNoPayment) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl px-4 py-8 lg:px-8"
    >
      <PromoBanner placement="checkout" />

      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <motion.button
          onClick={() => {
            if (clientSecret) {
              setClientSecret(null);
            } else {
              router.back();
            }
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground hover:shadow-md"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </motion.button>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {clientSecret ? "Payment" : "Checkout"}
          </h1>
          {!clientSecret && (
            <p className="text-sm text-muted-foreground">Review your order details</p>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* ── Payment Phase ─────────────────────────────────────────────── */}
        {clientSecret && stripePromise ? (
          <motion.div
            key="payment"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="mx-auto max-w-md"
          >
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm">
              <div className="border-b border-border/50 bg-primary/5 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
                    <CreditCard className="size-4" />
                  </span>
                  <p className="font-bold tracking-tight">Complete Payment</p>
                </div>
              </div>
              <div className="p-6">
                <div className="mb-6 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Order total</span>
                    <PriceDisplay cents={total} currency={currencyCode} className="font-bold" />
                  </div>
                  {customerWalletEnabled && effectiveWalletApply > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Wallet</span>
                        <span className="font-medium text-chart-2">
                          −<PriceDisplay cents={effectiveWalletApply} currency={currencyCode} className="inline text-chart-2" />
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold">
                        <span>Card charge</span>
                        <PriceDisplay cents={stripeChargeCents} currency={currencyCode} />
                      </div>
                    </>
                  ) : null}
                  <Separator className="opacity-60" />
                </div>

                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: "stripe",
                      variables: {
                        borderRadius: "10px",
                      },
                    },
                  }}
                >
                  <PaymentForm
                    total={stripeChargeCents}
                    currency={currencyCode}
                    onSuccess={handlePaymentSuccess}
                    onCancel={() => setClientSecret(null)}
                  />
                </Elements>
              </div>
            </div>
          </motion.div>
        ) : (
          /* ── Review Phase ───────────────────────────────────────────── */
          <motion.div
            key="review"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <Form {...checkoutForm}>
              <form onSubmit={submitCheckout} className="grid gap-6 lg:grid-cols-[1fr_360px]" noValidate>
              {/* Left column */}
              <div className="space-y-4">
                {checkoutError ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                    role="alert"
                  >
                    <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                    <p className="font-semibold">{checkoutError}</p>
                  </motion.div>
                ) : null}
                {workspaceMismatch && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4"
                  >
                    <AlertTriangle className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0 space-y-3 text-sm">
                      <p className="font-semibold text-foreground">
                        Your account is for a different location than this cart
                      </p>
                      <p className="text-muted-foreground">
                        Sign out, then sign in again using the button below.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={async () => {
                          await logout();
                          router.push(loginPathWithWorkspaceRef(projectRef ?? undefined));
                        }}
                      >
                        Sign out and continue
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* Delivery address */}
                <SectionCard
                  icon={MapPin}
                  title="Delivery Address"
                  subtitle="Where should we deliver your order?"
                >
                  {savedAddresses.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {savedAddresses.map((sa) => (
                        <motion.button
                          key={sa.id}
                          type="button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setSelectedAddressId(sa.id);
                            checkoutForm.setValue("address", formatCustomerAddressLine(sa));
                          }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                            selectedAddressId === sa.id
                              ? "border-primary bg-primary/10 text-primary shadow-sm"
                              : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                          )}
                        >
                          <MapPin className="size-3" />
                          {sa.label || sa.addressLine1?.slice(0, 25)}
                          {sa.isDefault && (
                            <span className="ml-0.5 text-[10px] opacity-60">
                              (default)
                            </span>
                          )}
                        </motion.button>
                      ))}
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          setSelectedAddressId(null);
                          checkoutForm.setValue("address", "");
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium transition-all",
                          !selectedAddressId
                            ? "border-primary bg-primary/10 text-primary shadow-sm"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        )}
                      >
                        New address
                      </motion.button>
                    </div>
                  )}

                  <FormField
                    control={checkoutForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Delivery address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter your delivery address"
                            className="rounded-xl"
                            onChange={(e) => {
                              setSelectedAddressId(null);
                              field.onChange(e);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <AnimatePresence>
                    {checkingDelivery && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
                      >
                        <Loader2 className="size-4 animate-spin" />
                        Checking delivery availability...
                      </motion.div>
                    )}

                    {cannotDeliver && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-3 flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-3"
                      >
                        <AlertTriangle className="size-4 shrink-0 text-destructive" />
                        <p className="text-sm font-semibold text-destructive">
                          {multiShopCartEnabled && draftGroups.length > 1
                            ? "One or more restaurants in your cart don't deliver to this address."
                            : "Sorry, this restaurant doesn't deliver to your area"}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </SectionCard>

            {/* Delivery instructions */}
            <SectionCard
              icon={StickyNote}
              title="Delivery Instructions"
              subtitle="Any special instructions for the driver?"
            >
              <FormField
                control={checkoutForm.control}
                name="deliveryNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="sr-only">Delivery instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="e.g. Leave at door, buzzer #3, call on arrival…"
                        maxLength={500}
                        rows={2}
                        className="resize-none rounded-xl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {watchedDeliveryNotes.length > 0 && (
                <p className="mt-1.5 text-right text-xs text-muted-foreground">
                  {watchedDeliveryNotes.length}/500
                </p>
              )}
            </SectionCard>

            {customerCutleryEnabled &&
              (useGroupedMin
                ? draftGroups.some((g, i) => minQueries[i]?.data?.cutleryOffered)
                : Boolean(shopData?.cutleryOffered)) && (
              <SectionCard
                icon={UtensilsCrossed}
                title="Cutlery"
                subtitle="Optional. The restaurant will see your choice on the order."
              >
                {useGroupedMin ? (
                  <div className="space-y-3">
                    {draftGroups.map((g, i) => {
                      const detail = minQueries[i]?.data;
                      if (!detail?.cutleryOffered) return null;
                      const key = `${g.projectRef}::${g.shopId}`;
                      const fee = detail.cutleryFeeCents ?? 0;
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-muted/10 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{detail.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {fee > 0 ? (
                                <span>
                                  Adds{" "}
                                  <PriceDisplay cents={fee} currency={currencyCode} className="inline font-medium" />{" "}
                                  when enabled
                                </span>
                              ) : (
                                "No extra charge"
                              )}
                            </p>
                          </div>
                          <Switch
                            checked={Boolean(cutleryByShopKey[key])}
                            onCheckedChange={(v) =>
                              setCutleryByShopKey((prev) => ({ ...prev, [key]: v }))
                            }
                            aria-label={`Cutlery for ${detail.name}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">Include cutlery</p>
                      <p className="text-xs text-muted-foreground">
                        {(shopData?.cutleryFeeCents ?? 0) > 0 ? (
                          <span>
                            Adds{" "}
                            <PriceDisplay
                              cents={shopData!.cutleryFeeCents!}
                              currency={currencyCode}
                              className="inline font-medium"
                            />{" "}
                            when enabled
                          </span>
                        ) : (
                          "No extra charge"
                        )}
                      </p>
                    </div>
                    <Switch
                      checked={wantsCutlerySingle}
                      onCheckedChange={setWantsCutlerySingle}
                      aria-label="Include cutlery with this order"
                    />
                  </div>
                )}
              </SectionCard>
            )}

            {/* Order items */}
            <SectionCard icon={ShoppingBag} title="Order Items">
              <AnimatedList className="space-y-3">
                {items.map((item) => (
                  <div key={item.id}>
                    {multiShopCartEnabled && item.shopName ? (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                        {item.shopName}
                      </p>
                    ) : null}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {item.name} &times; {item.quantity}
                      </span>
                      <PriceDisplay
                        cents={item.unitPriceCents * item.quantity}
                        currency={currencyCode}
                        className="font-semibold"
                      />
                    </div>
                    {item.selectedModifiers?.length ? (
                      <ul className="mt-0.5 list-none space-y-0.5 pl-1 text-xs text-muted-foreground">
                        {item.selectedModifiers.map((m, idx) => (
                          <li key={`${m.groupName}-${m.optionName}-${idx}`}>
                            {m.groupName}: {m.optionName}
                            {m.priceCents !== 0 ? (
                              <span className="text-muted-foreground/80">
                                {" "}
                                (+
                                <PriceDisplay
                                  cents={m.priceCents}
                                  currency={currencyCode}
                                  className="inline text-xs text-muted-foreground/80"
                                />
                                )
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.notes && (
                      <p className="mt-0.5 pl-1 text-xs italic text-muted-foreground/70">
                        &ldquo;{item.notes}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </AnimatedList>
            </SectionCard>

            {/* Promo code */}
            <SectionCard icon={Ticket} title="Promo Code">
              {promoApplied ? (
                <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-6 items-center justify-center rounded-full bg-primary/15">
                      <Check className="size-3.5 text-primary" />
                    </div>
                    <span className="text-sm font-bold text-primary">
                      {promoApplied.code}
                    </span>
                    <span className="text-xs text-primary/80">
                      {promoApplied.freeDelivery
                        ? "Free delivery!"
                        : `−${formatPrice(promoApplied.discountCents, currencyCode)} off`}
                    </span>
                  </div>
                  <button
                    onClick={clearPromo}
                    className="rounded-lg p-1 text-primary transition-colors hover:bg-primary/15"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <FormField
                    control={checkoutForm.control}
                    name="promoCode"
                    render={({ field }) => (
                      <FormItem className="flex-1 space-y-0">
                        <FormLabel className="sr-only">Promo code</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Enter promo code"
                            className="rounded-xl font-mono uppercase"
                            onChange={(e) => {
                              setPromoError("");
                              field.onChange(e.target.value.toUpperCase());
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleApplyPromo();
                              }
                            }}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => void handleApplyPromo()}
                    disabled={promoLoading || !watchedPromoCode.trim()}
                  >
                    {promoLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </div>
              )}
              {promoError && (
                <p className="mt-2 text-xs font-semibold text-destructive">
                  {promoError}
                </p>
              )}
            </SectionCard>

            {/* Schedule order */}
            <SectionCard
              icon={CalendarClock}
              title="Delivery Time"
              subtitle="Choose when you want your order"
            >
              <div className="flex gap-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => checkoutForm.setValue("scheduleMode", "now")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                    watchedScheduleMode === "now"
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <Clock className="size-4" />
                  As soon as possible
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => checkoutForm.setValue("scheduleMode", "later")}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all",
                    watchedScheduleMode === "later"
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                  )}
                >
                  <CalendarClock className="size-4" />
                  Schedule for later
                </motion.button>
              </div>

              <AnimatePresence>
                {watchedScheduleMode === "later" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    <FormField
                      control={checkoutForm.control}
                      name="scheduledDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-muted-foreground">Date</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              id="sched-date"
                              type="date"
                              min={new Date().toISOString().split("T")[0]}
                              className="rounded-xl"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={checkoutForm.control}
                      name="scheduledTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-semibold text-muted-foreground">Time</FormLabel>
                          <FormControl>
                            <Input {...field} id="sched-time" type="time" className="rounded-xl" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedScheduledDate && watchedScheduledTime && (
                      <p className="text-xs text-muted-foreground sm:col-span-2">
                        Your order will be placed at{" "}
                        <span className="font-semibold text-foreground">
                          {new Date(`${watchedScheduledDate}T${watchedScheduledTime}`).toLocaleString(language, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </SectionCard>
          </div>

          {/* Right column — Summary */}
          <motion.div layout className="h-fit space-y-4">
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm">
              <div className="border-b border-border/50 bg-primary/5 px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
                    <Receipt className="size-4" />
                  </span>
                  <p className="font-bold tracking-tight">Payment Summary</p>
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <PriceDisplay cents={totalCents()} currency={currencyCode} className="font-medium" />
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-primary">Discount</span>
                      <span className="font-semibold text-primary">
                        −<PriceDisplay cents={discount} currency={currencyCode} className="text-primary" />
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery</span>
                    {promoApplied?.freeDelivery ? (
                      <span className="text-sm">
                        <span className="mr-1 line-through text-muted-foreground">
                          <PriceDisplay cents={deliveryFee} currency={currencyCode} />
                        </span>
                        <span className="font-semibold text-primary">Free</span>
                      </span>
                    ) : (
                      <PriceDisplay cents={deliveryFee} currency={currencyCode} className="font-medium" />
                    )}
                  </div>
                  {cutlerySumCents > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Cutlery</span>
                      <PriceDisplay cents={cutlerySumCents} currency={currencyCode} className="font-medium" />
                    </div>
                  )}
                  <Separator className="opacity-60" />
                  <div className="flex justify-between text-lg font-extrabold">
                    <span>Total</span>
                    <motion.div
                      key={total}
                      initial={{ scale: 1.1, color: "var(--primary)" }}
                      animate={{ scale: 1, color: "var(--foreground)" }}
                    >
                      <PriceDisplay cents={total} currency={currencyCode} />
                    </motion.div>
                  </div>

                  <AnimatePresence>
                    {customerWalletEnabled && isAuthenticated && useCheckoutDraftFlow && walletBalanceCents > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 rounded-xl border border-border/60 bg-muted/20 p-4"
                      >
                        <div className="mb-3 flex items-center gap-2">
                          <Wallet className="size-4 text-primary" />
                          <p className="text-sm font-semibold">Wallet</p>
                        </div>
                        <p className="mb-2 text-xs text-muted-foreground">
                          Available:{" "}
                          <span className="font-medium text-foreground">
                            {formatPrice(walletBalanceCents, currencyCode)}
                          </span>
                        </p>
                        <label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="wallet-apply">
                          Pay from wallet (optional)
                        </label>
                        <input
                          id="wallet-apply"
                          type="range"
                          min={0}
                          max={Math.min(walletBalanceCents, total)}
                          step={1}
                          value={effectiveWalletApply}
                          onChange={(e) => setWalletApplyCents(Number(e.target.value))}
                          className="mb-2 w-full accent-primary"
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Applying</span>
                          <span className="font-semibold tabular-nums text-chart-2">
                            {formatPrice(effectiveWalletApply, currencyCode)}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="rounded-lg text-xs"
                            onClick={() =>
                              setWalletApplyCents(Math.min(walletBalanceCents, total))
                            }
                          >
                            Use max
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="rounded-lg text-xs"
                            onClick={() => setWalletApplyCents(0)}
                          >
                            Clear
                          </Button>
                        </div>
                        {effectiveWalletApply > 0 ? (
                          <p className="mt-3 text-xs text-muted-foreground">
                            Card charge:{" "}
                            <span className="font-semibold text-foreground">
                              {formatPrice(stripeChargeCents, currencyCode)}
                            </span>
                          </p>
                        ) : null}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <AnimatePresence>
                  {belowMinimum && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/10 px-4 py-3"
                    >
                      <AlertTriangle className="size-4 shrink-0 text-primary" />
                      <p className="text-sm font-semibold text-primary">
                        {useGroupedMin ? (
                          <>One or more shops in your cart are below their minimum order. Add more items.</>
                        ) : (
                          <>
                            Minimum order is{" "}
                            <PriceDisplay
                              cents={minimumOrderCents}
                              currency={currencyCode}
                              className="font-bold text-primary"
                            />
                            . Add{" "}
                            <PriceDisplay
                              cents={minimumOrderCents - totalCents()}
                              currency={currencyCode}
                              className="font-bold text-primary"
                            />{" "}
                            more.
                          </>
                        )}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Button
                    type="submit"
                    className="mt-6 w-full gap-2 rounded-xl shadow-md shadow-primary/20"
                    size="lg"
                    disabled={
                      loading ||
                      cannotDeliver ||
                      deliveryCheckPending ||
                      belowMinimum ||
                      workspaceMismatch ||
                      (watchedScheduleMode === "later" &&
                        (!watchedScheduledDate?.trim() || !watchedScheduledTime?.trim()))
                    }
                  >
                    {loading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : watchedScheduleMode === "later" ? (
                      <>
                        <CalendarClock className="size-4" />
                        {stripeChargeCents === 0 && effectiveWalletApply > 0 ? (
                          <>Schedule (wallet)</>
                        ) : (
                          <>
                            Schedule &amp; Pay{" "}
                            <PriceDisplay
                              cents={stripeChargeCents}
                              currency={currencyCode}
                              className="text-primary-foreground"
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <CreditCard className="size-4" />
                        {stripeChargeCents === 0 && effectiveWalletApply > 0 ? (
                          <>Pay with wallet</>
                        ) : (
                          <>
                            Pay{" "}
                            <PriceDisplay
                              cents={stripeChargeCents}
                              currency={currencyCode}
                              className="text-primary-foreground"
                            />
                          </>
                        )}
                      </>
                    )}
                  </Button>
                </motion.div>

                <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Shield className="size-3" />
                  Secure payment powered by Stripe
                </div>
              </div>
            </div>
          </motion.div>
          </form>
        </Form>
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}

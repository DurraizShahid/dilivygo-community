"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { ArrowLeft, Loader2, Wallet, Check, Shield } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AnimatedUl,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  formatPrice,
  useCurrency,
  useCustomerWalletEnabled,
  Skeleton,
  cn,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { stripePromise } from "@/lib/stripe";
import { useAuthStore } from "@/stores/auth-store";
import { PromoBanner } from "@/components/promo-banner";
import type { CustomerWalletLedgerType } from "@dilivygo/types";
import {
  parseTopupAmountCents,
  walletTopupSchema,
  type WalletTopupInput,
} from "@/lib/schemas/wallet";

const TX_LABEL: Record<CustomerWalletLedgerType, string> = {
  topup_stripe: "Top-up",
  admin_credit: "Credit",
  admin_debit: "Debit",
  refund_credit: "Refund",
  checkout_debit: "Order payment",
  adjustment: "Adjustment",
};

function TopUpPaymentForm({
  amountLabel,
  onDone,
  onCancel,
}: {
  amountLabel: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
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
      confirmParams: { return_url: `${window.location.origin}/wallet` },
      redirect: "if_required",
    });
    if (error) {
      setPaymentError(error.message ?? "Payment failed");
      setConfirming(false);
      return;
    }
    onDone();
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onSubmit={handleConfirm}
      className="space-y-4"
    >
      <p className="text-sm text-muted-foreground">
        Adding <span className="font-semibold text-foreground">{amountLabel}</span> to your wallet.
      </p>
      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/5 p-4">
        <PaymentElement onReady={() => setReady(true)} options={{ layout: "tabs" }} />
      </div>
      {paymentError ? (
        <div
          className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <Shield className="mt-0.5 size-4 shrink-0" />
          <p className="font-semibold">{paymentError}</p>
        </div>
      ) : null}
      <div className="flex gap-3">
        <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => {
              setPaymentError(null);
              onCancel();
            }}
            disabled={confirming}
          >
            Cancel
          </Button>
        </motion.div>
        <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
          <Button
            type="submit"
            className="w-full gap-2 rounded-xl"
            size="lg"
            disabled={!stripe || !ready || confirming}
          >
            {confirming ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Confirm
          </Button>
        </motion.div>
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="size-3" />
        Secure payment powered by Stripe
      </div>
    </motion.form>
  );
}

export default function WalletPage() {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const queryClient = useQueryClient();
  const currency = useCurrency();
  const walletEnabled = useCustomerWalletEnabled();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [topupSecret, setTopupSecret] = useState<string | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [topupSuccess, setTopupSuccess] = useState("");

  const topupForm = useForm<WalletTopupInput>({
    resolver: zodResolver(walletTopupSchema),
    defaultValues: { amount: "" },
    mode: "onSubmit",
  });
  const topupAmountStr = topupForm.watch("amount");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["customer-wallet"],
    queryFn: () => api.customerWallet.get(),
    enabled: isAuthenticated && walletEnabled,
  });

  const invalidateWallet = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["customer-wallet"] });
  }, [queryClient]);

  const onStartTopup = topupForm.handleSubmit(async (values) => {
    const amountCents = parseTopupAmountCents(values.amount);
    setTopupLoading(true);
    setTopupError("");
    setTopupSuccess("");
    try {
      const res = await api.customerWallet.topupIntent({
        amountCents,
        currency: currency.toLowerCase(),
      });
      if (res.isDummy) {
        setTopupSuccess(t("wallet.topupSuccess"));
        topupForm.reset({ amount: "" });
        invalidateWallet();
        return;
      }
      if (res.clientSecret) {
        setTopupSecret(res.clientSecret);
      } else {
        setTopupError(t("wallet.topupFailed"));
      }
    } catch (e: unknown) {
      setTopupError(e instanceof Error ? e.message : t("wallet.topupFailed"));
    } finally {
      setTopupLoading(false);
    }
  });

  function handleTopupDone() {
    setTopupSuccess(t("wallet.topupSuccess"));
    setTopupError("");
    setTopupSecret(null);
    topupForm.reset({ amount: "" });
    invalidateWallet();
  }

  if (authLoading || (!isAuthenticated && !authLoading)) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mx-auto max-w-2xl px-4 py-12"
      >
        <Skeleton className="h-40 w-full rounded-2xl" />
      </motion.div>
    );
  }

  if (!walletEnabled) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 lg:px-8">
        <PromoBanner placement="account" />
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="inline-block">
          <Link
            href="/account"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "mb-6 gap-2 rounded-xl",
            )}
          >
            <ArrowLeft className="size-4" />
            {t("wallet.back")}
          </Link>
        </motion.div>
        <Card className="rounded-2xl border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="size-5 text-muted-foreground" />
              {t("wallet.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("wallet.disabled")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const balance = data?.balanceCents ?? 0;
  const txs = data?.transactions ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl px-4 py-8 lg:px-8"
    >
      <PromoBanner placement="account" />

      <div className="mb-8 flex items-center gap-3">
        <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
          <Link
            href="/account"
            aria-label={t("wallet.back")}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "size-10 rounded-full",
            )}
          >
            <ArrowLeft className="size-5" />
          </Link>
        </motion.div>
        <div className="flex items-center gap-3">
          <motion.span
            initial={{ scale: 0.8, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15"
          >
            <Wallet className="size-5" />
          </motion.span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t("wallet.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("wallet.subtitle")}</p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t("wallet.loadError")}
        </p>
      ) : null}

      <div className="space-y-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-sm"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("wallet.balance")}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-10 w-48" />
          ) : (
            <motion.p
              key={balance}
              initial={{ y: 5, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mt-1 text-4xl font-bold tabular-nums tracking-tight"
            >
              {formatPrice(balance, currency)}
            </motion.p>
          )}
        </motion.div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm">
          <div className="border-b border-border/50 bg-primary/5 px-6 py-4">
            <p className="font-bold tracking-tight">{t("wallet.topUp")}</p>
            <p className="text-xs text-muted-foreground">
              {t("wallet.topUpHint", { min: formatPrice(50, currency) })}
            </p>
          </div>
          <div className="p-6">
            {topupError ? (
              <div
                className="mb-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                role="alert"
              >
                <Shield className="mt-0.5 size-4 shrink-0" />
                <p className="font-semibold">{topupError}</p>
              </div>
            ) : topupSuccess ? (
              <div
                className="mb-4 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-primary"
                role="status"
              >
                <Check className="mt-0.5 size-4 shrink-0" />
                <p className="font-semibold">{topupSuccess}</p>
              </div>
            ) : null}
            <AnimatePresence mode="wait">
              {topupSecret && stripePromise ? (
                <motion.div
                  key="stripe"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                >
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret: topupSecret,
                      appearance: { theme: "stripe", variables: { borderRadius: "10px" } },
                    }}
                  >
                    <TopUpPaymentForm
                      amountLabel={
                        topupAmountStr
                          ? formatPrice(parseTopupAmountCents(topupAmountStr), currency)
                          : "—"
                      }
                      onDone={handleTopupDone}
                      onCancel={() => setTopupSecret(null)}
                    />
                  </Elements>
                </motion.div>
              ) : (
                <motion.div
                  key="form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <Form {...topupForm}>
                    <form
                      onSubmit={onStartTopup}
                      className="flex flex-col gap-3 sm:flex-row sm:items-end"
                      noValidate
                    >
                      <FormField
                        control={topupForm.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem className="flex-1 space-y-1.5">
                            <FormLabel className="text-sm font-medium">
                              {t("wallet.amountLabel", { currency: currency.toUpperCase() })}
                            </FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                inputMode="decimal"
                                placeholder="10.00"
                                className="rounded-xl"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button
                          type="submit"
                          className="rounded-xl sm:min-w-[140px]"
                          size="lg"
                          disabled={topupLoading}
                        >
                          {topupLoading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            t("wallet.continueToPay")
                          )}
                        </Button>
                      </motion.div>
                    </form>
                  </Form>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm">
          <div className="border-b border-border/50 bg-muted/20 px-6 py-4">
            <p className="font-bold tracking-tight">{t("wallet.activity")}</p>
          </div>
          <div className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : txs.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t("wallet.noActivity")}</p>
            ) : (
              <AnimatedUl className="divide-y divide-border/60">
                {txs.map((tx, idx) => (
                  <motion.li
                    key={tx.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{TX_LABEL[tx.type] ?? tx.type}</p>
                      <time className="text-[11px] tabular-nums text-muted-foreground" dateTime={tx.createdAt}>
                        {new Date(tx.createdAt).toLocaleString()}
                      </time>
                    </div>
                    <motion.span
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        tx.amountCents >= 0 ? "text-chart-2" : "text-destructive",
                      )}
                    >
                      {tx.amountCents >= 0 ? "+" : ""}
                      {formatPrice(tx.amountCents, currency)}
                    </motion.span>
                  </motion.li>
                ))}
              </AnimatedUl>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

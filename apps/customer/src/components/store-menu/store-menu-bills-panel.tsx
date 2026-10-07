"use client";

import { Check, Loader2, Minus, Plus, ShoppingBag, X } from "lucide-react";
import {
  AnimatedList,
  Button,
  Input,
  PriceDisplay,
  cn,
  useDeliveryFeeConfig,
  computeDeliveryFee,
  formatPrice,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import type { CartItem } from "@dilivygo/types";
import type { CheckoutPromoApplied } from "@/stores/cart-store";

export type StoreMenuBillsPanelProps = {
  items: CartItem[];
  currency?: string;
  productThumb: (productId: string) => string | undefined;
  onQuantityChange: (itemId: string, nextQty: number) => void;
  onCheckout: () => void;
  promoPlaceholder: string;
  promoCode: string;
  onPromoCodeChange: (value: string) => void;
  onPromoApply: () => void;
  promoLoading: boolean;
  promoError: string;
  promoApplied: CheckoutPromoApplied | null;
  onPromoClear: () => void;
  className?: string;
};

export function StoreMenuBillsPanel({
  items,
  currency,
  productThumb,
  onQuantityChange,
  onCheckout,
  promoPlaceholder,
  promoCode,
  onPromoCodeChange,
  onPromoApply,
  promoLoading,
  promoError,
  promoApplied,
  onPromoClear,
  className,
}: StoreMenuBillsPanelProps) {
  const { t } = useTranslation("customer");
  const feeConfig = useDeliveryFeeConfig();
  const subtotal = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const deliveryFee = computeDeliveryFee(feeConfig, subtotal);
  const effectiveDeliveryFee = promoApplied?.freeDelivery ? 0 : deliveryFee;
  const discount = promoApplied?.discountCents ?? 0;
  const total = Math.max(subtotal - discount + effectiveDeliveryFee, 0);
  const currencyCode = currency ?? "USD";

  return (
    <div className={cn("flex h-full flex-col bg-card", className)}>
      <div className="border-b border-border/60 px-5 py-4">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {t("storeMenu.bills", { defaultValue: "Bills" })}
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
              <ShoppingBag className="size-7" />
            </div>
            <p className="mt-3 text-sm font-medium text-foreground">
              {t("storeMenu.emptyBill", { defaultValue: "No items yet" })}
            </p>
            <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
              {t("storeMenu.emptyBillHint", {
                defaultValue: "Add dishes from the menu — they will show up here.",
              })}
            </p>
          </div>
        ) : (
          <AnimatedList className="space-y-3">
          {items.map((item) => {
            const thumb = productThumb(item.productId);
            const line = item.unitPriceCents * item.quantity;
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/80 p-2.5 pr-3"
              >
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {thumb ? (
                    <img src={thumb} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-lg opacity-35">
                      🍽
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                    {item.name}
                  </p>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onQuantityChange(item.id, item.quantity - 1)}
                      className="flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label={t("cart.decreaseQuantity")}
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                      className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90"
                      aria-label={t("cart.increaseQuantity")}
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                </div>
                <PriceDisplay
                  cents={line}
                  currency={currency}
                  className="shrink-0 text-sm font-bold text-primary"
                />
              </div>
            );
          })}
          </AnimatedList>
        )}
      </div>

      <div className="border-t border-border/60 px-4 pb-5 pt-4">
        <div className="mb-4">
          {promoApplied ? (
            <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/10 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Check className="size-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-primary">
                    {promoApplied.code}
                  </p>
                  <p className="text-xs text-primary/80">
                    {promoApplied.freeDelivery
                      ? t("storeMenu.promoFreeDelivery", { defaultValue: "Free delivery!" })
                      : t("storeMenu.promoOff", {
                          amount: formatPrice(promoApplied.discountCents, currencyCode),
                          defaultValue: "−{{amount}} off",
                        })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onPromoClear}
                className="shrink-0 rounded-lg p-1 text-primary transition-colors hover:bg-primary/15"
                aria-label={t("storeMenu.promoRemove", { defaultValue: "Remove promo" })}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder={promoPlaceholder}
                value={promoCode}
                onChange={(e) => {
                  onPromoCodeChange(e.target.value.toUpperCase());
                }}
                className="h-11 rounded-xl border-border/60 pr-[4.5rem] font-mono text-sm uppercase"
                onKeyDown={(e) => {
                  if (e.key === "Enter") onPromoApply();
                }}
              />
              <Button
                type="button"
                size="sm"
                className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-lg px-3 text-xs font-semibold"
                onClick={onPromoApply}
                disabled={promoLoading || !promoCode.trim()}
              >
                {promoLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  t("storeMenu.promoApply", { defaultValue: "Apply" })
                )}
              </Button>
            </div>
          )}
          {promoError ? (
            <p className="mt-2 text-xs font-semibold text-destructive">{promoError}</p>
          ) : null}
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>{t("cart.subtotal")}</span>
            <PriceDisplay cents={subtotal} currency={currency} className="font-medium text-foreground" />
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("storeMenu.discount", { defaultValue: "Discount" })}</span>
            {discount > 0 ? (
              <span className="font-medium tabular-nums text-primary">
                −<PriceDisplay cents={discount} currency={currency} />
              </span>
            ) : (
              <span className="font-medium tabular-nums text-foreground">—</span>
            )}
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>{t("cart.deliveryFee")}</span>
            <PriceDisplay
              cents={effectiveDeliveryFee}
              currency={currency}
              className="font-medium text-foreground"
            />
          </div>
          <div className="my-3 border-t border-dashed border-border/70" />
          <div className="flex items-baseline justify-between">
            <span className="text-base font-bold text-foreground">{t("cart.total")}</span>
            <PriceDisplay cents={total} currency={currency} className="text-xl font-bold text-foreground" />
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          className="mt-5 h-12 w-full rounded-xl text-base font-semibold shadow-md shadow-primary/20"
          disabled={items.length === 0}
          onClick={onCheckout}
        >
          {t("storeMenu.checkoutNow", { defaultValue: "Checkout now" })}
        </Button>
      </div>
    </div>
  );
}

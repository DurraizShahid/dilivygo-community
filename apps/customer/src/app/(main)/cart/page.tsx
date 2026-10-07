"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Trash2,
  Plus,
  Minus,
  ArrowLeft,
  ShoppingBag,
  ArrowRight,
  MessageSquare,
  Receipt,
} from "lucide-react";
import {
  Button,
  Separator,
  PriceDisplay,
  Input,
  cn,
  useDeliveryFeeConfig,
  computeDeliveryFee,
  useMultiShopCartEnabled,
} from "@dilivygo/ui";
import { useTranslation } from "@dilivygo/i18n";
import { useCartStore } from "@/stores/cart-store";
import { PromoBanner } from "@/components/promo-banner";

export default function CartPage() {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const { items, updateQuantity, updateItemNotes, removeItem, clear, totalCents, currency: cartCurrency } =
    useCartStore();
  const multiShopCartEnabled = useMultiShopCartEnabled();
  const feeConfig = useDeliveryFeeConfig();
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.notes).map((i) => i.id))
  );

  if (items.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex min-h-[70vh] flex-col items-center justify-center px-4"
      >
        <div className="flex flex-col items-center rounded-3xl border border-dashed border-border/70 bg-muted/30 px-10 py-20 text-center shadow-inner dark:bg-muted/15">
          <motion.div
            initial={{ y: 0 }}
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="flex size-24 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 text-primary ring-2 ring-primary/15 shadow-sm"
          >
            <ShoppingBag className="size-12" />
          </motion.div>
          <h2 className="mt-6 text-xl font-bold tracking-tight">{t("cart.empty")}</h2>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            {t("cart.emptyDescription")}
          </p>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={() => router.push("/")}
              className="mt-8 rounded-full px-8 shadow-md shadow-primary/20"
              size="lg"
            >
              {t("cart.browseRestaurants")}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  const subtotal = totalCents();
  const deliveryFee = computeDeliveryFee(feeConfig, subtotal);
  const total = subtotal + deliveryFee;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl px-4 py-8 lg:px-8"
    >
      <PromoBanner placement="cart" />

      {/* Header */}
      <div className="mb-8 flex items-center gap-4">
        <motion.button
          onClick={() => router.back()}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="flex size-10 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted hover:text-foreground hover:shadow-md"
          aria-label={t("cart.goBack")}
        >
          <ArrowLeft className="size-5" />
        </motion.button>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t("cart.yourCart")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("cart.itemsInCart", { count: items.length })}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Items */}
        <motion.div layout className="space-y-3">
          <AnimatePresence initial={false}>
            {items.map((item, idx) => (
              <motion.div
                layout
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-border hover:shadow-md"
              >
                {multiShopCartEnabled &&
                item.shopName &&
                (idx === 0 || items[idx - 1]?.shopName !== item.shopName) ? (
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-primary/80">
                    {item.shopName}
                  </p>
                ) : null}
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold tracking-tight">{item.name}</h3>
                    {item.selectedModifiers?.length ? (
                      <ul className="mt-1 list-none space-y-0.5 text-xs text-muted-foreground">
                        {item.selectedModifiers.map((m, idx) => (
                          <li key={`${m.groupName}-${m.optionName}-${idx}`}>
                            {m.groupName}: {m.optionName}
                            {m.priceCents !== 0 ? (
                              <span>
                                {" "}
                                (+
                                <PriceDisplay
                                  cents={m.priceCents}
                                  currency={cartCurrency ?? undefined}
                                  className="inline text-xs text-muted-foreground"
                                />
                                )
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <PriceDisplay
                      cents={item.unitPriceCents}
                      currency={cartCurrency ?? undefined}
                      className="mt-0.5 text-sm text-muted-foreground"
                    />
                  </div>

                  <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-1 py-0.5">
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-primary"
                      aria-label={t("cart.decreaseQuantity")}
                    >
                      <Minus className="size-3.5" />
                    </motion.button>
                    <motion.span
                      key={item.quantity}
                      initial={{ y: -4, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="w-7 text-center text-sm font-bold"
                    >
                      {item.quantity}
                    </motion.span>
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-primary"
                      aria-label={t("cart.increaseQuantity")}
                    >
                      <Plus className="size-3.5" />
                    </motion.button>
                  </div>

                  <PriceDisplay
                    cents={item.unitPriceCents * item.quantity}
                    currency={cartCurrency ?? undefined}
                    className="w-20 text-right font-bold"
                  />

                  <motion.button
                    whileHover={{ scale: 1.1, color: "var(--destructive)" }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => removeItem(item.id)}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t("cart.removeItem")}
                  >
                    <Trash2 className="size-4" />
                  </motion.button>
                </div>

                <AnimatePresence>
                  {expandedNotes.has(item.id) ? (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 border-t border-border/40 pt-3"
                    >
                      <Input
                        placeholder={t("cart.notesPlaceholder")}
                        value={item.notes ?? ""}
                        onChange={(e) => updateItemNotes(item.id, e.target.value)}
                        className="rounded-xl text-sm"
                        maxLength={500}
                      />
                    </motion.div>
                  ) : (
                    <motion.button
                      layout
                      type="button"
                      onClick={() => setExpandedNotes((prev) => new Set([...prev, item.id]))}
                      className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground/70 transition-colors hover:text-primary"
                    >
                      <MessageSquare className="size-3" />
                      {item.notes ? item.notes : t("cart.addSpecialInstructions")}
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>

          <button
            onClick={() => clear()}
            className="mt-1 text-xs text-muted-foreground/60 transition-colors hover:text-destructive"
          >
            {t("cart.clearCart")}
          </button>
        </motion.div>

        {/* Order summary */}
        <motion.div
          layout
          className="h-fit overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur-sm"
        >
          <div className="border-b border-border/50 bg-primary/5 px-6 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15">
                <Receipt className="size-4" />
              </span>
              <h2 className="font-bold tracking-tight">{t("cart.orderSummary")}</h2>
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("cart.subtotal")}</span>
                <PriceDisplay cents={subtotal} currency={cartCurrency ?? undefined} className="font-medium" />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("cart.deliveryFee")}</span>
                <PriceDisplay cents={deliveryFee} currency={cartCurrency ?? undefined} className="font-medium" />
              </div>
              <Separator className="opacity-60" />
              <div className="flex justify-between text-lg font-extrabold">
                <span>{t("cart.total")}</span>
                <motion.div
                  key={total}
                  initial={{ scale: 1.1, color: "var(--primary)" }}
                  animate={{ scale: 1, color: "var(--foreground)" }}
                >
                  <PriceDisplay cents={total} currency={cartCurrency ?? undefined} />
                </motion.div>
              </div>
            </div>

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={() => router.push("/checkout")}
                className="mt-6 w-full gap-2 rounded-xl shadow-md shadow-primary/20"
                size="lg"
              >
                {t("cart.proceedToCheckout")}
                <ArrowRight className="size-4" />
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

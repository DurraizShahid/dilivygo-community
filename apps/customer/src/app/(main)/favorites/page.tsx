"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Heart, ShoppingCart, Store, Star } from "lucide-react";
import { useTranslation } from "@dilivygo/i18n";
import { Button, PriceDisplay, Skeleton, useConfirm, useMultiShopCartEnabled } from "@dilivygo/ui";
import type { Product, ProductVariant } from "@dilivygo/types";
import { useFavorites, useFavoriteMutations } from "@/hooks/use-favorites";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";

function pickDefaultVariant(product: Pick<Product, "variants">): ProductVariant | null {
  const list = (product.variants ?? [])
    .filter((v) => v.available !== false)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  return list[0] ?? null;
}

function favoriteProductDisplayPriceCents(product: Pick<Product, "variants" | "priceCents">): number {
  const vs = (product.variants ?? []).filter((v) => v.available !== false);
  if (vs.length) return Math.min(...vs.map((v) => v.priceCents));
  return product.priceCents;
}

export default function FavoritesPage() {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const { data, isLoading: loadingFavorites } = useFavorites();
  const { toggleShop, toggleProduct } = useFavoriteMutations();
  const cart = useCartStore();
  const multiShopCartEnabled = useMultiShopCartEnabled();
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-8 lg:px-8">
        <Skeleton className="h-9 w-56 rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const favoriteShops = data?.favoriteShops ?? [];
  const favoriteProducts = data?.favoriteProducts ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-4xl px-4 py-8 lg:px-8"
    >
      {confirmDialog}
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <motion.span
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm"
        >
          <Heart className="size-5" />
        </motion.span>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("favoritesPage.title")}</h1>
      </div>

      <AnimatePresence mode="wait">
        {loadingFavorites ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </motion.div>
        ) : favoriteShops.length === 0 && favoriteProducts.length === 0 ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/70 bg-muted/30 px-6 py-20 text-center shadow-inner dark:bg-muted/15"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/10 text-primary ring-2 ring-primary/15 shadow-sm"
            >
              <Heart className="size-10" />
            </motion.div>
            <h3 className="mt-6 text-lg font-bold tracking-tight">No favourites yet</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              {t("favoritesPage.empty")}
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
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-10"
          >
            {favoriteShops.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm">
                    <Store className="size-4" />
                  </span>
                  <h2 className="text-lg font-bold tracking-tight">
                    {t("favoritesPage.favoriteRestaurants")}
                  </h2>
                </div>
                <motion.div layout className="space-y-3">
                  <AnimatePresence initial={false}>
                    {favoriteShops.map((fav) => (
                      <motion.div
                        layout
                        key={fav.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-primary/25 hover:shadow-md"
                      >
                        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10 transition-transform group-hover:scale-[1.03]">
                          <Store className="size-6 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold tracking-tight">{fav.shop.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{fav.shop.address}</p>
                        </div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 rounded-xl"
                            onClick={() => router.push(`/restaurant/${fav.shop.projectRef}/${fav.shop.id}`)}
                          >
                            {t("favoritesPage.open")}
                          </Button>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              void toggleShop
                                .mutateAsync({ shopId: fav.shopId, favorite: true })
                                .catch(() => {})
                            }
                          >
                            {t("favoritesPage.remove")}
                          </Button>
                        </motion.div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </section>
            )}

            {favoriteProducts.length > 0 && (
              <section>
                <div className="mb-4 flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary ring-1 ring-primary/15 shadow-sm">
                    <Star className="size-4" />
                  </span>
                  <h2 className="text-lg font-bold tracking-tight">
                    {t("favoritesPage.favoriteItems")}
                  </h2>
                </div>
                <motion.div layout className="space-y-3">
                  <AnimatePresence initial={false}>
                    {favoriteProducts.map((fav) => (
                      <motion.div
                        layout
                        key={fav.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="group flex items-center gap-4 rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-primary/25 hover:shadow-md"
                      >
                        {fav.product.imageUrl ? (
                          <div className="size-16 shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-border/50">
                            <motion.img
                              src={fav.product.imageUrl}
                              alt={fav.product.name}
                              whileHover={{ scale: 1.05 }}
                              className="size-full object-cover transition-transform duration-300"
                            />
                          </div>
                        ) : (
                          <div className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted via-primary/5 to-accent/10 text-2xl shadow-sm ring-1 ring-border/50">
                            🍽
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-bold tracking-tight">{fav.product.name}</p>
                          <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{fav.product.description}</div>
                          <PriceDisplay
                            cents={favoriteProductDisplayPriceCents(fav.product)}
                            className="mt-1 text-sm font-semibold"
                          />
                        </div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            size="sm"
                            className="shrink-0 gap-1.5 rounded-xl shadow-sm"
                            onClick={async () => {
                              if (
                                !multiShopCartEnabled &&
                                cart.shopId &&
                                fav.shopId &&
                                cart.shopId !== fav.shopId
                              ) {
                                const ok = await confirm({
                                  title: t("favoritesPage.clearCartForShopConfirm"),
                                  confirmLabel: t("common.confirm", { defaultValue: "Continue" }),
                                  variant: "destructive",
                                });
                                if (!ok) return;
                                cart.clear();
                              }
                              cart.setProjectRef(fav.product.projectRef);
                              if (fav.shopId) cart.setShopId(fav.shopId);
                              const variants = fav.product.variants ?? [];
                              const variant = variants.length ? pickDefaultVariant(fav.product) : null;
                              if (variants.length && !variant) {
                                return;
                              }
                              const lineName = variant
                                ? `${fav.product.name} — ${variant.name}`
                                : fav.product.name;
                              const unitPriceCents = variant
                                ? variant.priceCents
                                : fav.product.priceCents;
                              cart.addItem({
                                id: crypto.randomUUID(),
                                sessionId: "",
                                productId: fav.product.id,
                                ...(variant ? { productVariantId: variant.id } : {}),
                                name: lineName,
                                quantity: 1,
                                unitPriceCents,
                                createdAt: new Date().toISOString(),
                                ...(fav.shopId
                                  ? { shopId: fav.shopId, projectRef: fav.product.projectRef }
                                  : {}),
                              });
                            }}
                          >
                            <ShoppingCart className="size-4" />
                            {t("favoritesPage.add")}
                          </Button>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() =>
                              void toggleProduct
                                .mutateAsync({ productId: fav.productId, favorite: true })
                                .catch(() => {})
                            }
                          >
                            {t("favoritesPage.remove")}
                          </Button>
                        </motion.div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              </section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueries, useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ShoppingCart,
  Plus,
  Minus,
  Heart,
  MapPin,
  Clock,
  Star,
  Store,
} from "lucide-react";
import { Button, Skeleton, PriceDisplay, cn, useConfirm, useMultiShopCartEnabled } from "@dilivygo/ui";
import { useProducts, useWorkspace } from "@/hooks/use-products";
import { useFavorites, useFavoriteMutations } from "@/hooks/use-favorites";
import { useCartStore } from "@/stores/cart-store";
import { useAuthStore } from "@/stores/auth-store";
import { useLocationStore } from "@/stores/location-store";
import { DIETARY_TAG_OPTIONS, type Product } from "@dilivygo/types";
import { PromoBanner } from "@/components/promo-banner";
import { api } from "@/lib/api";
import { getDistanceKmBetweenCoords } from "@/lib/distance-km";

export default function RestaurantPage() {
  const { ref } = useParams<{ ref: string }>();
  const router = useRouter();
  const { data: workspace, isLoading: wsLoading } = useWorkspace(ref);
  const { data: products, isLoading: prodLoading } = useProducts(ref);
  const { data: shops } = useQuery({
    queryKey: ["restaurant-ref-shops", ref],
    queryFn: () => api.public.shops(ref),
    enabled: !!ref,
  });
  const reviewSummaryQueries = useQueries({
    queries: (shops ?? []).map((shop) => ({
      queryKey: ["restaurant-ref-shop-summary", ref, shop.id],
      queryFn: () => api.public.shopReviews(ref, shop.id, { limit: 1 }),
      enabled: !!shops?.length,
    })),
  });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { lat, lon } = useLocationStore();
  const { data: favorites } = useFavorites();
  const { toggleProduct } = useFavoriteMutations();
  const {
    addItem,
    items,
    projectRef,
    shopId: cartShopId,
    setProjectRef,
    setShopId,
    clear,
    itemCount,
    totalCents,
    updateQuantity,
  } = useCartStore();
  const multiShopCartEnabled = useMultiShopCartEnabled();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const categories = useMemo(() => {
    if (!products) return [];
    const cats = new Set(products.map((p) => p.category || "Other"));
    return Array.from(cats);
  }, [products]);

  const filtered = useMemo(() => {
    if (!products) return [];
    if (!activeCategory) return products;
    return products.filter(
      (p) => (p.category || "Other") === activeCategory
    );
  }, [products, activeCategory]);

  const availableProducts = useMemo(
    () => filtered.filter((p) => p.available),
    [filtered]
  );

  const workspaceEtaLabel = useMemo(() => {
    if (lat == null || lon == null || !shops?.length) return "25-35 min";
    let minEta = 60;
    for (const s of shops) {
      if (s.lat == null || s.lon == null) continue;
      const distKm = getDistanceKmBetweenCoords(lat, lon, s.lat, s.lon);
      const eta = Math.max(15, Math.min(60, Math.round(20 + distKm * 4)));
      if (eta < minEta) minEta = eta;
    }
    return `${minEta} min`;
  }, [lat, lon, shops]);

  async function confirmClearCart() {
    return confirm({
      title: "Clear cart for this restaurant?",
      description:
        "You have items from another restaurant. Continuing will clear your cart.",
      confirmLabel: "Clear cart",
      variant: "destructive",
    });
  }

  async function handleAddToCart(product: Product) {
    const productShopId = product.shopId ?? shops?.[0]?.id;
    const shopMeta = shops?.find((s) => s.id === productShopId);

    if (multiShopCartEnabled) {
      if (projectRef && projectRef !== ref) {
        const ok = await confirmClearCart();
        if (!ok) return;
        clear();
      }
      setProjectRef(ref);
      if (productShopId) setShopId(productShopId);
      addItem({
        id: crypto.randomUUID(),
        sessionId: "",
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPriceCents: product.priceCents,
        createdAt: new Date().toISOString(),
        shopId: productShopId,
        projectRef: ref as string,
        shopName: shopMeta?.name,
      });
      return;
    }

    if (projectRef && projectRef !== ref) {
      const ok = await confirmClearCart();
      if (!ok) return;
      clear();
    }
    setProjectRef(ref);
    addItem({
      id: crypto.randomUUID(),
      sessionId: "",
      productId: product.id,
      name: product.name,
      quantity: 1,
      unitPriceCents: product.priceCents,
      createdAt: new Date().toISOString(),
    });
  }

  function getCartQuantity(product: Product) {
    if (projectRef !== ref) return 0;
    const productShopId = product.shopId ?? shops?.[0]?.id;
    if (multiShopCartEnabled && productShopId) {
      return items
        .filter(
          (i) =>
            i.productId === product.id &&
            (i.shopId ?? cartShopId) === productShopId &&
            !(i.selectedModifiers && i.selectedModifiers.length > 0)
        )
        .reduce((s, i) => s + i.quantity, 0);
    }
    const item = items.find((i) => i.productId === product.id);
    return item?.quantity || 0;
  }

  const isLoading = wsLoading || prodLoading;
  const workspaceReviewSummary = useMemo(() => {
    let weightedTotal = 0;
    let reviewCount = 0;
    for (const query of reviewSummaryQueries) {
      const average = query.data?.summary?.averageRating ?? 0;
      const count = query.data?.summary?.reviewCount ?? 0;
      weightedTotal += average * count;
      reviewCount += count;
    }
    return {
      averageRating: reviewCount ? weightedTotal / reviewCount : 0,
      reviewCount,
    };
  }, [reviewSummaryQueries]);

  function requireAuthForFavorite() {
    return isAuthenticated;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen pb-24"
    >
      {confirmDialog}
      {/* Banner */}
      <div className="relative h-56 overflow-hidden bg-muted sm:h-72 lg:h-80">
        {isLoading ? (
          <Skeleton className="size-full" />
        ) : workspace?.bannerUrl ? (
          <motion.img
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            src={workspace.bannerUrl}
            alt={workspace.name}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
            <Store className="size-20 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => router.back()}
          className="absolute left-4 top-4 flex size-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-background lg:left-8"
          aria-label="Go back"
        >
          <ArrowLeft className="size-5" />
        </motion.button>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 lg:px-8">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mx-auto max-w-7xl"
          >
            <h1 className="text-2xl font-bold text-white drop-shadow-sm sm:text-3xl">
              {isLoading ? <Skeleton className="h-8 w-48" /> : workspace?.name}
            </h1>
            {workspace?.description && (
              <p className="mt-1 text-sm text-white/80 line-clamp-1">
                {workspace.description}
              </p>
            )}
          </motion.div>
        </div>
      </div>

      {/* Meta */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="border-b border-border/50 bg-card"
      >
        <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto px-4 py-3 text-sm lg:px-8 hide-scrollbar">
          <div className="flex shrink-0 items-center gap-1.5 text-primary">
            <Star className="size-4 fill-current" />
            <span className="font-semibold">
              {workspaceReviewSummary.reviewCount
                ? workspaceReviewSummary.averageRating.toFixed(1)
                : "New"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4" />
            <span>{workspaceEtaLabel}</span>
          </div>
        </div>
      </motion.div>

      <div className="mx-auto max-w-7xl px-4 py-4 lg:px-8">
        <PromoBanner placement="restaurant_menu" />
      </div>

      {/* Category nav */}
      {categories.length > 1 && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-16 z-30 border-b border-border/50 bg-background/95 backdrop-blur-md"
        >
          <div className="mx-auto max-w-7xl px-4 lg:px-8">
            <div className="hide-scrollbar flex gap-1 overflow-x-auto py-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all",
                  activeCategory === null
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                All
              </motion.button>
              {categories.map((cat) => (
                <motion.button
                  key={cat}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveCategory(cat)}
                  className={cn(
                    "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all",
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {cat}
                </motion.button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Products */}
      <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex gap-4 rounded-2xl border border-border/50 p-4"
                >
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                  <Skeleton className="size-24 shrink-0 rounded-xl" />
                </div>
              ))}
            </motion.div>
          ) : availableProducts.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <motion.div
                animate={{
                  y: [0, -10, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="flex size-16 items-center justify-center rounded-full bg-muted"
              >
                <Store className="size-8 text-muted-foreground" />
              </motion.div>
              <h3 className="mt-4 text-lg font-semibold">No items available</h3>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {availableProducts.map((product) => {
                const qty = getCartQuantity(product);
                return (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group flex gap-4 rounded-2xl border border-border/50 bg-card p-4 transition-all hover:border-border hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold leading-tight">
                        {product.name}
                      </h3>
                      {product.description && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                          {product.description}
                        </p>
                      )}
                      {!!product.dietaryTags?.length && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {product.dietaryTags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-border/70 bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                            >
                              {DIETARY_TAG_OPTIONS.find((opt) => opt.value === tag)?.label ?? tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-3">
                        <PriceDisplay
                          cents={product.priceCents}
                          className="text-base font-semibold"
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          type="button"
                          onClick={() => {
                            if (!requireAuthForFavorite()) return;
                            const favorite = !!favorites?.favoriteProducts?.some(
                              (f) => f.productId === product.id
                            );
                            void toggleProduct
                              .mutateAsync({ productId: product.id, favorite })
                              .catch(() => {});
                          }}
                          className="inline-flex size-9 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          aria-label="Toggle favorite item"
                        >
                          <Heart
                            className={cn(
                              "size-4",
                              favorites?.favoriteProducts?.some((f) => f.productId === product.id) &&
                                "fill-current text-primary"
                            )}
                          />
                        </motion.button>
                        {qty > 0 ? (
                          <motion.div
                            layout
                            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-1"
                          >
                            <motion.button
                              whileTap={{ scale: 0.8 }}
                              onClick={() => {
                                const productShopId = product.shopId ?? shops?.[0]?.id;
                                const item = items.find((i) => {
                                  if (i.productId !== product.id) return false;
                                  if (
                                    multiShopCartEnabled &&
                                    productShopId &&
                                    (i.shopId ?? cartShopId) !== productShopId
                                  )
                                    return false;
                                  return !(i.selectedModifiers && i.selectedModifiers.length > 0);
                                });
                                if (item) updateQuantity(item.id, qty - 1);
                              }}
                              className="flex size-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
                            >
                              <Minus className="size-4" />
                            </motion.button>
                            <motion.span
                              key={qty}
                              initial={{ scale: 1.2, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              className="w-6 text-center text-sm font-semibold text-primary"
                            >
                              {qty}
                            </motion.span>
                            <motion.button
                              whileTap={{ scale: 0.8 }}
                              onClick={() => handleAddToCart(product)}
                              className="flex size-8 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
                            >
                              <Plus className="size-4" />
                            </motion.button>
                          </motion.div>
                        ) : (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleAddToCart(product)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md active:scale-[0.98]"
                          >
                            <Plus className="size-4" />
                            Add
                          </motion.button>
                        )}
                      </div>
                    </div>

                    {product.imageUrl ? (
                      <div className="size-24 shrink-0 overflow-hidden rounded-xl sm:size-28">
                        <motion.img
                          whileHover={{ scale: 1.1 }}
                          transition={{ duration: 0.4 }}
                          src={product.imageUrl}
                          alt={product.name}
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex size-24 shrink-0 items-center justify-center rounded-xl bg-muted/60 text-3xl sm:size-28">
                        🍽
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating cart bar */}
      <AnimatePresence>
        {itemCount() > 0 && projectRef === ref && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-[76px] right-0 z-40 p-4"
          >
            <div className="mx-auto max-w-lg">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push("/cart")}
                className="flex w-full items-center justify-between rounded-2xl bg-primary px-6 py-4 text-primary-foreground shadow-xl shadow-primary/25 transition-all hover:bg-primary/95 hover:shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary-foreground/20">
                    <ShoppingCart className="size-4" />
                  </div>
                  <span className="font-semibold">
                    {itemCount()} {itemCount() === 1 ? "item" : "items"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <PriceDisplay
                    cents={totalCents()}
                    className="text-lg font-bold text-primary-foreground"
                  />
                  <ArrowLeft className="size-4 rotate-180" />
                </div>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

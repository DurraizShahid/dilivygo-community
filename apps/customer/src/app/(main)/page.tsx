"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { LocateFixed, Store, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  Button,
  Skeleton,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
  useDietaryTagPresetsFromTheme,
  useBrowseCategoryPresetsFromTheme,
} from "@dilivygo/ui";
import { api } from "@/lib/api";
import { useResolvedProjectRefList } from "@/lib/resolved-project-ref";
import { useLocationStore } from "@/stores/location-store";
import { useBrowseSearchStore } from "@/stores/browse-search-store";
import { useAuthStore } from "@/stores/auth-store";
import { HeroBanner } from "@/components/hero-banner";
import { CategoryFilter } from "@/components/category-filter";
import { RestaurantCard } from "@/components/restaurant-card";
import { PromoBanner } from "@/components/promo-banner";
import { HomeNearbyRestaurantStrip } from "@/components/home-nearby-restaurant-strip";
import { HomePopularDishesStrip } from "@/components/home-popular-dishes-strip";
import type { PopularDishItem } from "@/components/home-popular-dishes-strip";
import { useFavorites, useFavoriteMutations } from "@/hooks/use-favorites";
import type { DietaryTag, Product, Shop } from "@dilivygo/types";
import { useTranslation } from "@dilivygo/i18n";
import { getDistanceKm } from "@/lib/distance-km";

const MotionButton = motion.create(Button);

export default function HomePage() {
  // Runtime-resolved organization `public_ref` for the current tenant host
  // (e.g. `helptribepk` on `helptribepk.customer.dilivygo.com`). This MUST be
  // read at runtime — the same build serves every tenant, so build-time env
  // cannot identify the current organization. See `lib/resolved-project-ref.tsx`.
  const PUBLIC_SHOP_REFS = useResolvedProjectRefList();
  const { t } = useTranslation("customer");
  const themeDietaryPresets = useDietaryTagPresetsFromTheme();
  const themeBrowsePresets = useBrowseCategoryPresetsFromTheme();
  const search = useBrowseSearchStore((s) => s.query);
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<DietaryTag[]>([]);
  const [priceTier, setPriceTier] = useState<"all" | "budget" | "mid" | "premium">("all");
  const [maxDeliveryMins, setMaxDeliveryMins] = useState<"all" | "20" | "30" | "45" | "60">("all");
  const [maxMinOrder, setMaxMinOrder] = useState<"all" | "1000" | "2000" | "3000" | "5000">("all");
  const [minRating, setMinRating] = useState<"all" | "4.0" | "4.3" | "4.5">("all");
  const [maxDistanceKm, setMaxDistanceKm] = useState<"all" | "3" | "5" | "10" | "20">("all");
  const [sortBy, setSortBy] = useState<"relevance" | "distance" | "rating" | "delivery_time" | "min_order" | "name">("relevance");
  const { lat, lon, status } = useLocationStore();
  const hasDeliveryPoint = lat != null && lon != null;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: favorites } = useFavorites();
  const { toggleShop } = useFavoriteMutations();

  const sortedBrowsePresets = useMemo(() => {
    const list = themeBrowsePresets ?? [];
    return [...list].sort(
      (a, b) =>
        (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.label.localeCompare(b.label),
    );
  }, [themeBrowsePresets]);

  const validBrowseCodes = useMemo(
    () => new Set(sortedBrowsePresets.map((p) => p.code)),
    [sortedBrowsePresets],
  );

  const browseLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of sortedBrowsePresets) m.set(p.code, p.label);
    return m;
  }, [sortedBrowsePresets]);

  useEffect(() => {
    if (activeCategory === "all") return;
    if (!validBrowseCodes.has(activeCategory)) setActiveCategory("all");
  }, [activeCategory, validBrowseCodes]);

  const { data: shops, isLoading } = useQuery<Shop[]>({
    queryKey: [
      "all-shops",
      PUBLIC_SHOP_REFS.join(","),
      lat ?? "none",
      lon ?? "none",
    ],
    queryFn: async () => {
      if (lat == null || lon == null) return [];
      const results = await Promise.allSettled(
        PUBLIC_SHOP_REFS.map((ref) => api.public.shops(ref, lat, lon))
      );
      return results
        .filter(
          (r): r is PromiseFulfilledResult<Shop[]> =>
            r.status === "fulfilled"
        )
        .flatMap((r) => r.value);
    },
    enabled: hasDeliveryPoint,
  });

  const productQueries = useQueries({
    queries: (shops ?? []).map((shop) => ({
      queryKey: ["home-shop-products", shop.projectRef, shop.id],
      queryFn: () => api.public.shopProducts(shop.projectRef, shop.id),
      enabled: !!shops?.length,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const reviewQueries = useQueries({
    queries: (shops ?? []).map((shop) => ({
      queryKey: ["home-shop-reviews-summary", shop.projectRef, shop.id],
      queryFn: () => api.public.shopReviews(shop.projectRef, shop.id, { limit: 1 }),
      enabled: !!shops?.length,
      staleTime: 2 * 60 * 1000,
    })),
  });

  const shopProductsById = useMemo(() => {
    const map = new Map<string, Product[]>();
    (shops ?? []).forEach((shop, idx) => {
      const query = productQueries[idx];
      map.set(shop.id, Array.isArray(query?.data) ? query.data : []);
    });
    return map;
  }, [shops, productQueries]);

  const dietaryFilterOptions = useMemo(() => {
    const coreI18n: Record<string, string> = {
      vegan: "filters.vegan",
      halal: "filters.halal",
      gluten_free: "filters.glutenFree",
      nut_free: "filters.nutFree",
    };
    const list =
      themeDietaryPresets?.length
        ? themeDietaryPresets
        : [
            { code: "vegan", label: "" },
            { code: "halal", label: "" },
            { code: "gluten_free", label: "" },
            { code: "nut_free", label: "" },
          ];
    return list.map((p) => ({
      value: p.code as DietaryTag,
      label: coreI18n[p.code] ? t(coreI18n[p.code]) : p.label,
    }));
  }, [themeDietaryPresets, t]);

  const shopReviewSummaryById = useMemo(() => {
    const map = new Map<string, { averageRating: number; reviewCount: number }>();
    (shops ?? []).forEach((shop, idx) => {
      const summary = reviewQueries[idx]?.data?.summary;
      map.set(shop.id, {
        averageRating: summary?.averageRating ?? 0,
        reviewCount: summary?.reviewCount ?? 0,
      });
    });
    return map;
  }, [shops, reviewQueries]);

  const shopMetaById = useMemo(() => {
    const map = new Map<
      string,
      {
        cuisines: string[];
        dietaryTags: DietaryTag[];
        avgPriceCents: number;
        priceTier: "budget" | "mid" | "premium";
        minOrderCents: number;
        etaMinutes: number;
        distanceKm: number | null;
        rating: number;
        reviewCount: number;
      }
    >();

    for (const shop of shops ?? []) {
      const products = shopProductsById.get(shop.id) ?? [];
      const cuisines = (shop.browseCategoryIds ?? []).filter((id) => validBrowseCodes.has(id));
      const dietaryTags = Array.from(
        new Set(
          products.flatMap((p) => p.dietaryTags ?? [])
        )
      ) as DietaryTag[];

      const prices = products.map((p) => p.priceCents).filter((v) => Number.isFinite(v) && v > 0);
      const avgPriceCents = prices.length
        ? Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length)
        : 1600;
      const minOrderCents = typeof shop.minimumOrderCents === "number" && shop.minimumOrderCents > 0
        ? shop.minimumOrderCents
        : 0;
      const distanceKm = getDistanceKm(lat, lon, shop.lat, shop.lon);
      const etaMinutes = Math.max(15, Math.min(60, Math.round(20 + (distanceKm ?? 2.5) * 4)));
      const reviewSummary = shopReviewSummaryById.get(shop.id);
      const reviewCount = reviewSummary?.reviewCount ?? 0;
      const rating =
        reviewCount > 0 && typeof reviewSummary?.averageRating === "number"
          ? reviewSummary.averageRating
          : 0;

      map.set(shop.id, {
        cuisines,
        dietaryTags,
        avgPriceCents,
        priceTier:
          avgPriceCents < 1200 ? "budget" : avgPriceCents <= 2400 ? "mid" : "premium",
        minOrderCents,
        etaMinutes,
        distanceKm,
        rating,
        reviewCount,
      });
    }

    return map;
  }, [shops, shopProductsById, shopReviewSummaryById, lat, lon, validBrowseCodes]);

  const filtered = useMemo(() => {
    if (!shops) return [];
    let list = [...shops];
    const tokens = search
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (search.trim()) {
      list = list.filter((s) => {
        const meta = shopMetaById.get(s.id);
        const products = shopProductsById.get(s.id) ?? [];
        const browseLabels = (s.browseCategoryIds ?? [])
          .map((id) => browseLabelByCode.get(id))
          .filter(Boolean) as string[];
        const haystack = [
          s.name,
          s.description,
          s.address,
          ...(meta?.cuisines ?? []),
          ...browseLabels,
          ...products.map((p) => p.name),
          ...products.map((p) => p.category ?? ""),
          ...products.flatMap((p) => p.dietaryTags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
    }

    if (activeCategory && activeCategory !== "all") {
      list = list.filter((s) => shopMetaById.get(s.id)?.cuisines.includes(activeCategory));
    }

    if (selectedCuisines.length) {
      list = list.filter((s) =>
        selectedCuisines.some((cuisine) => shopMetaById.get(s.id)?.cuisines.includes(cuisine))
      );
    }

    if (selectedDietary.length) {
      list = list.filter((s) =>
        selectedDietary.every((tag) => shopMetaById.get(s.id)?.dietaryTags.includes(tag))
      );
    }

    if (priceTier !== "all") {
      list = list.filter((s) => shopMetaById.get(s.id)?.priceTier === priceTier);
    }

    if (maxDeliveryMins !== "all") {
      list = list.filter((s) => (shopMetaById.get(s.id)?.etaMinutes ?? 999) <= Number(maxDeliveryMins));
    }

    if (maxMinOrder !== "all") {
      list = list.filter((s) => (shopMetaById.get(s.id)?.minOrderCents ?? Number.MAX_SAFE_INTEGER) <= Number(maxMinOrder));
    }

    if (minRating !== "all") {
      list = list.filter((s) => (shopMetaById.get(s.id)?.rating ?? 0) >= Number(minRating));
    }

    if (maxDistanceKm !== "all") {
      list = list.filter((s) => {
        const distanceKm = shopMetaById.get(s.id)?.distanceKm;
        return distanceKm != null && distanceKm <= Number(maxDistanceKm);
      });
    }

    list.sort((a, b) => {
      const metaA = shopMetaById.get(a.id);
      const metaB = shopMetaById.get(b.id);
      switch (sortBy) {
        case "distance":
          return (metaA?.distanceKm ?? Number.MAX_SAFE_INTEGER) - (metaB?.distanceKm ?? Number.MAX_SAFE_INTEGER);
        case "rating":
          return (metaB?.rating ?? 0) - (metaA?.rating ?? 0);
        case "delivery_time":
          return (metaA?.etaMinutes ?? 999) - (metaB?.etaMinutes ?? 999);
        case "min_order":
          return (metaA?.minOrderCents ?? Number.MAX_SAFE_INTEGER) - (metaB?.minOrderCents ?? Number.MAX_SAFE_INTEGER);
        case "name":
          return (a.name ?? "").localeCompare(b.name ?? "");
        case "relevance":
        default: {
          if (!tokens.length) return (a.name ?? "").localeCompare(b.name ?? "");
          const scoreA = relevanceScore(
            a,
            tokens,
            shopMetaById.get(a.id)?.cuisines ?? [],
            shopProductsById.get(a.id) ?? []
          );
          const scoreB = relevanceScore(
            b,
            tokens,
            shopMetaById.get(b.id)?.cuisines ?? [],
            shopProductsById.get(b.id) ?? []
          );
          return scoreB - scoreA;
        }
      }
    });

    return list;
  }, [
    shops,
    search,
    activeCategory,
    selectedCuisines,
    selectedDietary,
    priceTier,
    maxDeliveryMins,
    maxMinOrder,
    minRating,
    maxDistanceKm,
    sortBy,
    shopMetaById,
    shopProductsById,
    browseLabelByCode,
  ]);

  const isFiltering = Boolean(
    selectedCuisines.length ||
    selectedDietary.length ||
    priceTier !== "all" ||
    maxDeliveryMins !== "all" ||
    maxMinOrder !== "all" ||
    minRating !== "all" ||
    maxDistanceKm !== "all" ||
    sortBy !== "relevance"
  );

  const popularDishItems = useMemo((): PopularDishItem[] => {
    if (!shops?.length) return [];
    const rows: PopularDishItem[] = [];
    for (const shop of shops) {
      const products = shopProductsById.get(shop.id) ?? [];
      const rating = shopMetaById.get(shop.id)?.rating ?? 0;
      for (const p of products) {
        if (p.available === false) continue;
        rows.push({
          product: p,
          shop,
          rating,
        });
      }
    }
    rows.sort((a, b) => {
      const ai = a.product.imageUrl ? 1 : 0;
      const bi = b.product.imageUrl ? 1 : 0;
      if (ai !== bi) return bi - ai;
      const so = (a.product.sortOrder ?? 0) - (b.product.sortOrder ?? 0);
      if (so !== 0) return so;
      return a.product.name.localeCompare(b.product.name);
    });
    return rows.slice(0, 14);
  }, [shops, shopProductsById, shopMetaById]);

  const nearbyStripShops = useMemo(
    () => filtered.slice(0, 12),
    [filtered],
  );

  const openShops = useMemo(() => filtered.filter((s) => s.isOpen !== false), [filtered]);
  const closedShops = useMemo(() => filtered.filter((s) => s.isOpen === false), [filtered]);

  function clearAdvancedFilters() {
    setSelectedCuisines([]);
    setSelectedDietary([]);
    setPriceTier("all");
    setMaxDeliveryMins("all");
    setMaxMinOrder("all");
    setMinRating("all");
    setMaxDistanceKm("all");
    setSortBy("relevance");
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <HeroBanner />
      </motion.div>

      <div className="mx-auto max-w-7xl px-4 pb-6 lg:px-8">
        <PromoBanner placement="home_below_hero" />
        {status === "denied" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-6 flex items-center gap-3 rounded-[18px] border border-primary/25 bg-primary/10 px-5 py-4 text-sm text-foreground"
          >
            <LocateFixed className="size-5 shrink-0 text-primary" />
            <div>
              <p className="font-medium text-foreground">{t("home.enableLocation")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("home.enableLocationDesc")}
              </p>
            </div>
          </motion.div>
        )}

        <PromoBanner placement="home_promotions" />

        <motion.section
          id="browse-section"
          className="mt-10 scroll-mt-6"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              {t("home.menuCategory")}
            </h2>
            <Link
              href="#all-restaurants"
              className="group flex items-center gap-1 shrink-0 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              {t("home.viewMore")}{" "}
              <motion.span
                aria-hidden
                className="inline-block translate-y-px"
                whileHover={{ x: 3 }}
                transition={{ type: "spring", stiffness: 400, damping: 10 }}
              >
                ›
              </motion.span>
            </Link>
          </div>
          <CategoryFilter
            presets={sortedBrowsePresets}
            active={activeCategory}
            onSelect={setActiveCategory}
            variant="default"
          />

          <PromoBanner
            placement="home_explore_deals"
            heading={t("home.exploreDeals", { defaultValue: "Explore Your Deals" })}
          />

          {hasDeliveryPoint && popularDishItems.length > 0 && (
            <motion.div
              className="mt-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {t("home.popularDishes")}
                </h2>
                <Link
                  href="#all-restaurants"
                  className="group flex items-center gap-1 shrink-0 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  {t("home.viewMore")}{" "}
                  <motion.span
                    aria-hidden
                    className="inline-block translate-y-px"
                    whileHover={{ x: 3 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    ›
                  </motion.span>
                </Link>
              </div>
              <HomePopularDishesStrip items={popularDishItems} />
            </motion.div>
          )}

          {hasDeliveryPoint && nearbyStripShops.length > 0 && (
            <motion.div
              className="mt-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  {t("home.nearbyRestaurantsSection")}
                </h2>
                <Link
                  href="#all-restaurants"
                  className="group flex items-center gap-1 shrink-0 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
                >
                  {t("home.viewMore")}{" "}
                  <motion.span
                    aria-hidden
                    className="inline-block translate-y-px"
                    whileHover={{ x: 3 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    ›
                  </motion.span>
                </Link>
              </div>
              <HomeNearbyRestaurantStrip
                shops={nearbyStripShops}
                metricsById={shopMetaById}
              />
            </motion.div>
          )}

          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3 border-b border-border pb-6"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <TrendingUp className="size-5" />
            </span>
            <h2
              id="all-restaurants"
              className="text-lg font-extrabold tracking-tight text-foreground sm:text-xl"
            >
              {search ? (
                <AnimatePresence mode="wait">
                  <motion.span
                    key={search}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {t("home.resultsFor")}{" "}
                    <span className="text-primary">&ldquo;{search}&rdquo;</span>
                  </motion.span>
                </AnimatePresence>
              ) : (
                <>
                  <span className="text-primary">{t("home.allRestaurants")}</span>
                  <span className="font-semibold text-muted-foreground">
                    {" "}
                    · {t("home.nearYou")}
                  </span>
                </>
              )}
            </h2>
            {hasDeliveryPoint && shops && (
              <span className="ml-auto text-sm text-muted-foreground">
                {filtered.length}{" "}
                {filtered.length === 1 ? t("home.place") : t("home.places")}
              </span>
            )}
          </motion.div>

          <div className="mt-4 rounded-[18px] border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t("filters.advancedFilters")}
              </h3>
              {isFiltering && (
                <MotionButton
                  variant="ghost"
                  size="sm"
                  onClick={clearAdvancedFilters}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="text-primary hover:bg-muted hover:text-primary/80"
                >
                  {t("filters.clearFilters")}
                </MotionButton>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs text-muted-foreground">
                {t("filters.sortBy")}
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                  <SelectTrigger className="mt-1 w-full border-border bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="relevance">{t("filters.relevance")}</SelectItem>
                    <SelectItem value="distance">{t("filters.distance")}</SelectItem>
                    <SelectItem value="rating">{t("filters.rating")}</SelectItem>
                    <SelectItem value="delivery_time">{t("filters.deliveryTime")}</SelectItem>
                    <SelectItem value="min_order">{t("filters.minimumOrder")}</SelectItem>
                    <SelectItem value="name">{t("filters.nameAZ")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">
                {t("filters.priceRange")}
                <Select value={priceTier} onValueChange={(v) => setPriceTier(v as typeof priceTier)}>
                  <SelectTrigger className="mt-1 w-full border-border bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.all")}</SelectItem>
                    <SelectItem value="budget">{t("filters.budget")}</SelectItem>
                    <SelectItem value="mid">{t("filters.mid")}</SelectItem>
                    <SelectItem value="premium">{t("filters.premium")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">
                {t("filters.maxDeliveryTime")}
                <Select value={maxDeliveryMins} onValueChange={(v) => setMaxDeliveryMins(v as typeof maxDeliveryMins)}>
                  <SelectTrigger className="mt-1 w-full border-border bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.any")}</SelectItem>
                    <SelectItem value="20">{t("filters.minutes", { count: 20 })}</SelectItem>
                    <SelectItem value="30">{t("filters.minutes", { count: 30 })}</SelectItem>
                    <SelectItem value="45">{t("filters.minutes", { count: 45 })}</SelectItem>
                    <SelectItem value="60">{t("filters.minutes", { count: 60 })}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">
                {t("filters.maxMinOrder")}
                <Select value={maxMinOrder} onValueChange={(v) => setMaxMinOrder(v as typeof maxMinOrder)}>
                  <SelectTrigger className="mt-1 w-full border-border bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.any")}</SelectItem>
                    <SelectItem value="1000">{t("filters.upTo", { amount: 10 })}</SelectItem>
                    <SelectItem value="2000">{t("filters.upTo", { amount: 20 })}</SelectItem>
                    <SelectItem value="3000">{t("filters.upTo", { amount: 30 })}</SelectItem>
                    <SelectItem value="5000">{t("filters.upTo", { amount: 50 })}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">
                {t("filters.minRating")}
                <Select value={minRating} onValueChange={(v) => setMinRating(v as typeof minRating)}>
                  <SelectTrigger className="mt-1 w-full border-border bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.any")}</SelectItem>
                    <SelectItem value="4.0">4.0+</SelectItem>
                    <SelectItem value="4.3">4.3+</SelectItem>
                    <SelectItem value="4.5">4.5+</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-xs text-muted-foreground">
                {t("filters.maxDistance")}
                <Select value={maxDistanceKm} onValueChange={(v) => setMaxDistanceKm(v as typeof maxDistanceKm)}>
                  <SelectTrigger className="mt-1 w-full border-border bg-background text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("filters.any")}</SelectItem>
                    <SelectItem value="3">{t("filters.km", { count: 3 })}</SelectItem>
                    <SelectItem value="5">{t("filters.km", { count: 5 })}</SelectItem>
                    <SelectItem value="10">{t("filters.km", { count: 10 })}</SelectItem>
                    <SelectItem value="20">{t("filters.km", { count: 20 })}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <div className="md:col-span-2 text-xs text-muted-foreground">
                {t("filters.cuisineType")}
                <div className="mt-1 flex flex-wrap gap-2">
                  {sortedBrowsePresets.map((cuisine) => {
                    const selected = selectedCuisines.includes(cuisine.code);
                    return (
                      <button
                        key={cuisine.code}
                        type="button"
                        onClick={() =>
                          setSelectedCuisines((prev) =>
                            selected ? prev.filter((id) => id !== cuisine.code) : [...prev, cuisine.code]
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          selected
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-muted text-foreground hover:border-primary/35"
                        }`}
                      >
                        {cuisine.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-2 text-xs text-muted-foreground">
                {t("filters.dietaryPreferences")}
                <div className="mt-1 flex flex-wrap gap-2">
                  {dietaryFilterOptions.map((tag) => {
                    const selected = selectedDietary.includes(tag.value);
                    return (
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() =>
                          setSelectedDietary((prev) =>
                            selected ? prev.filter((x) => x !== tag.value) : [...prev, tag.value]
                          )
                        }
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          selected
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-muted text-foreground hover:border-primary/35"
                        }`}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <PromoBanner placement="restaurant_list" />
        </motion.section>

        <section className="mt-8 pb-16">
          {(hasDeliveryPoint && isLoading) ||
          (!hasDeliveryPoint &&
            (status === "loading" || status === "idle")) ? (
            <div className="grid auto-rows-[minmax(0,1fr)] gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-border bg-card"
                >
                  <Skeleton className="aspect-[16/10] w-full shrink-0 rounded-none" />
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Skeleton className="h-5 w-4/5" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                      </div>
                      <Skeleton className="h-7 w-14 shrink-0 rounded-lg" />
                    </div>
                    <Skeleton className="mt-2 h-4 w-3/4" />
                    <Skeleton className="mt-3 h-6 w-full max-w-[240px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : !hasDeliveryPoint && status === "denied" ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-card/50 px-6 py-20 text-center">
              <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-2 ring-primary/25">
                <LocateFixed className="size-10" />
              </div>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-foreground">
                {t("home.enableLocation")}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t("home.enableLocationDesc")}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-[20px] border border-dashed border-border bg-card/50 px-6 py-20 text-center">
              <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-2 ring-primary/25">
                <Store className="size-10" />
              </div>
              <h3 className="mt-5 text-lg font-bold tracking-tight text-foreground">
                {t("home.noRestaurantsFound")}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {search || isFiltering
                  ? t("home.tryDifferentSearch")
                  : activeCategory !== "all"
                    ? t("home.noCategoryMatch")
                    : hasDeliveryPoint
                      ? t("home.noDeliveryToArea")
                      : t("home.noShopsAvailable")}
              </p>
            </div>
          ) : (
            <div>
              {openShops.length > 0 ? (
                <div className="grid auto-rows-[minmax(0,1fr)] gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {openShops.map((shop) => (
                    <RestaurantCard
                      key={shop.id}
                      className="h-full"
                      shop={shop}
                      metrics={{
                        etaMinutes: shopMetaById.get(shop.id)?.etaMinutes,
                        rating: shopMetaById.get(shop.id)?.rating,
                        reviewCount: shopMetaById.get(shop.id)?.reviewCount,
                        minOrderCents: shopMetaById.get(shop.id)?.minOrderCents,
                        distanceKm: shopMetaById.get(shop.id)?.distanceKm,
                      }}
                      isFavorite={!!favorites?.favoriteShops?.some((f) => f.shopId === shop.id)}
                      onToggleFavorite={(targetShop) => {
                        if (!isAuthenticated) {
                          return;
                        }
                        const favorite = !!favorites?.favoriteShops?.some(
                          (f) => f.shopId === targetShop.id,
                        );
                        void toggleShop.mutateAsync({ shopId: targetShop.id, favorite }).catch(() => {});
                      }}
                    />
                  ))}
                </div>
              ) : null}

              {closedShops.length > 0 ? (
                <div className="mt-10">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">
                      {t("home.closedRestaurants", { defaultValue: "Closed Restaurants" })}
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      {closedShops.length}{" "}
                      {closedShops.length === 1 ? t("home.place") : t("home.places")}
                    </span>
                  </div>
                  <div className="grid auto-rows-[minmax(0,1fr)] gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {closedShops.map((shop) => (
                      <RestaurantCard
                        key={shop.id}
                        className="h-full"
                        shop={shop}
                        metrics={{
                          etaMinutes: shopMetaById.get(shop.id)?.etaMinutes,
                          rating: shopMetaById.get(shop.id)?.rating,
                          reviewCount: shopMetaById.get(shop.id)?.reviewCount,
                          minOrderCents: shopMetaById.get(shop.id)?.minOrderCents,
                          distanceKm: shopMetaById.get(shop.id)?.distanceKm,
                        }}
                        isFavorite={!!favorites?.favoriteShops?.some((f) => f.shopId === shop.id)}
                        onToggleFavorite={(targetShop) => {
                          if (!isAuthenticated) {
                            return;
                          }
                          const favorite = !!favorites?.favoriteShops?.some(
                            (f) => f.shopId === targetShop.id,
                          );
                          void toggleShop.mutateAsync({ shopId: targetShop.id, favorite }).catch(() => {});
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function relevanceScore(
  shop: Shop,
  tokens: string[],
  cuisines: string[],
  products: Product[]
) {
  const text = [
    shop.name,
    shop.description,
    shop.address,
    ...cuisines,
    ...products.map((p) => p.name),
    ...products.map((p) => p.category ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return tokens.reduce((score, token) => (text.includes(token) ? score + 1 : score), 0);
}

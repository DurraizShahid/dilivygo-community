import type { DietaryTag, Product, Shop } from "@dilivygo/types";
import { getDistanceKm, relevanceScore } from "@/lib/browse-search-helpers";

export type ShopBrowseMeta = {
  cuisines: string[];
  dietaryTags: DietaryTag[];
  avgPriceCents: number;
  priceTier: "budget" | "mid" | "premium";
  minOrderCents: number;
  etaMinutes: number;
  distanceKm: number | null;
  rating: number;
  reviewCount: number;
};

export type BrowseSortOption =
  | "relevance"
  | "distance"
  | "rating"
  | "delivery_time"
  | "min_order"
  | "name";

export type PriceTierFilter = "all" | "budget" | "mid" | "premium";
export type MinsFilter = "all" | "20" | "30" | "45" | "60";
export type MinOrderFilter = "all" | "1000" | "2000" | "3000" | "5000";
export type RatingFilter = "all" | "4.0" | "4.3" | "4.5";
export type DistanceFilter = "all" | "3" | "5" | "10" | "20";

export type BrowseFilterState = {
  query: string;
  activeCategory: string;
  selectedCuisines: string[];
  selectedDietary: DietaryTag[];
  priceTier: PriceTierFilter;
  maxDeliveryMins: MinsFilter;
  maxMinOrder: MinOrderFilter;
  minRating: RatingFilter;
  maxDistanceKm: DistanceFilter;
  sortBy: BrowseSortOption;
};

export function buildShopMetaById(
  shops: Shop[],
  shopProductsById: Map<string, Product[]>,
  shopReviewSummaryById: Map<string, { averageRating: number; reviewCount: number }>,
  lat: number | null,
  lon: number | null,
  validBrowseCodes: Set<string>,
): Map<string, ShopBrowseMeta> {
  const map = new Map<string, ShopBrowseMeta>();

  for (const shop of shops) {
    const products = shopProductsById.get(shop.id) ?? [];
    const cuisines = (shop.browseCategoryIds ?? []).filter((id) =>
      validBrowseCodes.has(id),
    );
    const dietaryTags = Array.from(
      new Set(products.flatMap((p) => p.dietaryTags ?? [])),
    ) as DietaryTag[];

    const prices = products
      .map((p) => p.priceCents)
      .filter((v) => Number.isFinite(v) && v > 0);
    const avgPriceCents = prices.length
      ? Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length)
      : 1600;
    const minOrderCents =
      typeof shop.minimumOrderCents === "number" && shop.minimumOrderCents > 0
        ? shop.minimumOrderCents
        : 0;
    const distanceKm = getDistanceKm(lat, lon, shop.lat, shop.lon);
    const etaMinutes = Math.max(
      15,
      Math.min(60, Math.round(20 + (distanceKm ?? 2.5) * 4)),
    );
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
}

export function filterAndSortShops(
  shops: Shop[] | undefined,
  filters: BrowseFilterState,
  shopMetaById: Map<string, ShopBrowseMeta>,
  shopProductsById: Map<string, Product[]>,
  browseLabelByCode: Map<string, string>,
): Shop[] {
  if (!shops?.length) return [];

  let list = [...shops];
  const tokens = filters.query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (filters.query.trim()) {
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

  if (filters.activeCategory && filters.activeCategory !== "all") {
    list = list.filter((s) =>
      shopMetaById.get(s.id)?.cuisines.includes(filters.activeCategory),
    );
  }

  if (filters.selectedCuisines.length) {
    list = list.filter((s) =>
      filters.selectedCuisines.some((cuisine) =>
        shopMetaById.get(s.id)?.cuisines.includes(cuisine),
      ),
    );
  }

  if (filters.selectedDietary.length) {
    list = list.filter((s) =>
      filters.selectedDietary.every((tag) =>
        shopMetaById.get(s.id)?.dietaryTags.includes(tag),
      ),
    );
  }

  if (filters.priceTier !== "all") {
    list = list.filter(
      (s) => shopMetaById.get(s.id)?.priceTier === filters.priceTier,
    );
  }

  if (filters.maxDeliveryMins !== "all") {
    list = list.filter(
      (s) =>
        (shopMetaById.get(s.id)?.etaMinutes ?? 999) <=
        Number(filters.maxDeliveryMins),
    );
  }

  if (filters.maxMinOrder !== "all") {
    list = list.filter(
      (s) =>
        (shopMetaById.get(s.id)?.minOrderCents ?? Number.MAX_SAFE_INTEGER) <=
        Number(filters.maxMinOrder),
    );
  }

  if (filters.minRating !== "all") {
    list = list.filter(
      (s) =>
        (shopMetaById.get(s.id)?.rating ?? 0) >= Number(filters.minRating),
    );
  }

  if (filters.maxDistanceKm !== "all") {
    list = list.filter((s) => {
      const distanceKm = shopMetaById.get(s.id)?.distanceKm;
      return (
        distanceKm != null && distanceKm <= Number(filters.maxDistanceKm)
      );
    });
  }

  list.sort((a, b) => {
    const metaA = shopMetaById.get(a.id);
    const metaB = shopMetaById.get(b.id);
    switch (filters.sortBy) {
      case "distance":
        return (
          (metaA?.distanceKm ?? Number.MAX_SAFE_INTEGER) -
          (metaB?.distanceKm ?? Number.MAX_SAFE_INTEGER)
        );
      case "rating":
        return (metaB?.rating ?? 0) - (metaA?.rating ?? 0);
      case "delivery_time":
        return (metaA?.etaMinutes ?? 999) - (metaB?.etaMinutes ?? 999);
      case "min_order":
        return (
          (metaA?.minOrderCents ?? Number.MAX_SAFE_INTEGER) -
          (metaB?.minOrderCents ?? Number.MAX_SAFE_INTEGER)
        );
      case "name":
        return (a.name ?? "").localeCompare(b.name ?? "");
      case "relevance":
      default: {
        if (!tokens.length) return (a.name ?? "").localeCompare(b.name ?? "");
        const scoreA = relevanceScore(
          a,
          tokens,
          shopMetaById.get(a.id)?.cuisines ?? [],
          shopProductsById.get(a.id) ?? [],
        );
        const scoreB = relevanceScore(
          b,
          tokens,
          shopMetaById.get(b.id)?.cuisines ?? [],
          shopProductsById.get(b.id) ?? [],
        );
        return scoreB - scoreA;
      }
    }
  });

  return list;
}

export function isAdvancedFilteringActive(f: BrowseFilterState): boolean {
  return Boolean(
    f.selectedCuisines.length ||
      f.selectedDietary.length ||
      f.priceTier !== "all" ||
      f.maxDeliveryMins !== "all" ||
      f.maxMinOrder !== "all" ||
      f.minRating !== "all" ||
      f.maxDistanceKm !== "all" ||
      f.sortBy !== "relevance",
  );
}

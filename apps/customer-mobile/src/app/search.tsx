import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useTranslation } from "@dilivygo/i18n";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { AppColors } from "@/lib/theme";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import { SCREEN_H_PAD, elevatedCardShadow } from "@/lib/screen-layout";
import { useLocationStore } from "@/stores/location-store";
import { api } from "@/lib/api";
import { useCurrencyStore } from "@/lib/currency";
import { PUBLIC_SHOP_REFS } from "@/lib/public-shop-refs";
import { filterShopsByDeliveryPoint } from "@/lib/shop-geofence-filter";
import {
  buildShopMetaById,
  filterAndSortShops,
  isAdvancedFilteringActive,
  type BrowseFilterState,
  type BrowseSortOption,
  type PriceTierFilter,
  type MinsFilter,
  type MinOrderFilter,
  type RatingFilter,
  type DistanceFilter,
} from "@/lib/customer-browse-filter";
import type { DietaryTag, Product, Shop } from "@dilivygo/types";

function initialFilters(): BrowseFilterState {
  return {
    query: "",
    activeCategory: "all",
    selectedCuisines: [],
    selectedDietary: [],
    priceTier: "all",
    maxDeliveryMins: "all",
    maxMinOrder: "all",
    minRating: "all",
    maxDistanceKm: "all",
    sortBy: "relevance",
  };
}

function createSearchStyles(c: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: SCREEN_H_PAD,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: borderRadius.lg,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.muted,
    },
    title: {
      flex: 1,
      fontSize: fontSize.xl,
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.4,
    },
    filterPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: borderRadius.full,
      backgroundColor: c.muted,
      maxWidth: 140,
    },
    filterPillText: {
      fontSize: fontSize.sm,
      fontWeight: "600",
      color: c.foreground,
      flexShrink: 1,
    },
    filterBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    filterBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: c.primaryForeground,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.muted,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md,
      marginHorizontal: SCREEN_H_PAD,
      minHeight: 52,
      ...elevatedCardShadow(2),
    },
    searchIcon: { marginRight: spacing.md },
    searchInput: {
      flex: 1,
      fontSize: fontSize.base,
      fontFamily: fonts.regular,
      color: c.foreground,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.foreground,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      marginBottom: spacing.sm,
      marginTop: spacing.md,
    },
    chipRow: { paddingHorizontal: SCREEN_H_PAD, marginBottom: spacing.sm },
    chipScroll: { flexGrow: 0 },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: borderRadius.full,
      marginRight: spacing.sm,
      borderWidth: 1,
    },
    chipText: { fontSize: fontSize.sm, fontWeight: "600" },
    chipInner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    chipIcon: {
      width: 18,
      height: 18,
      borderRadius: 4,
    },
    countRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: SCREEN_H_PAD,
      paddingVertical: spacing.sm,
    },
    countText: { fontSize: fontSize.sm, color: c.mutedForeground },
    listContent: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingBottom: spacing.xxl,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      overflow: "hidden",
      marginBottom: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      ...elevatedCardShadow(),
    },
    cardImage: {
      width: "100%",
      height: 140,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
    },
    cardImagePlaceholder: {
      width: "100%",
      height: 140,
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    cardBody: { padding: spacing.lg },
    cardTitle: {
      fontSize: fontSize.lg,
      fontWeight: "700",
      color: c.foreground,
      marginBottom: spacing.xs,
    },
    cardDescription: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      lineHeight: 20,
      marginBottom: spacing.sm,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    metaPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: borderRadius.md,
      backgroundColor: c.muted,
    },
    metaPillText: { fontSize: fontSize.xs, color: c.mutedForeground },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xl,
      gap: spacing.md,
    },
    emptyTitle: {
      fontSize: fontSize.lg,
      fontWeight: "700",
      color: c.foreground,
      textAlign: "center",
    },
    emptyHint: {
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      textAlign: "center",
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
    },
    modalSheet: {
      maxHeight: "88%",
      borderTopLeftRadius: borderRadius.xl,
      borderTopRightRadius: borderRadius.xl,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    modalTitle: { fontSize: fontSize.lg, fontWeight: "800", color: c.foreground },
    modalBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    modalFooter: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    modalBtn: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.lg,
      alignItems: "center",
    },
    modalBtnGhost: { backgroundColor: c.muted },
    modalBtnPrimary: { backgroundColor: c.primary },
    modalBtnGhostText: { fontWeight: "700", color: c.foreground },
    modalBtnPrimaryText: { fontWeight: "700", color: c.primaryForeground },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    optionRowText: { fontSize: fontSize.base, color: c.foreground },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  });
}

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createSearchStyles);
  const { t } = useTranslation("customer");
  const { t: tm } = useTranslation("mobile");
  const { t: tCommon } = useTranslation("common");
  const inputRef = useRef<TextInput>(null);

  const themeDietaryPresets = useCurrencyStore((s) => s.dietaryTagPresets);
  const themeBrowsePresets = useCurrencyStore((s) => s.browseCategoryPresets);

  const [filters, setFilters] = useState<BrowseFilterState>(initialFilters);
  const [filtersModalOpen, setFiltersModalOpen] = useState(false);
  const [draft, setDraft] = useState<BrowseFilterState>(initialFilters);

  useEffect(() => {
    const tmr = setTimeout(() => inputRef.current?.focus(), 400);
    return () => clearTimeout(tmr);
  }, []);

  const locStatus = useLocationStore((s) => s.status);
  const locLat = useLocationStore((s) => s.lat);
  const locLon = useLocationStore((s) => s.lon);

  const hasDeliveryPoint =
    locLat != null &&
    locLon != null &&
    Number.isFinite(locLat) &&
    Number.isFinite(locLon);

  const sortedBrowsePresets = useMemo(() => {
    const list = themeBrowsePresets ?? [];
    return [...list].sort(
      (a, b) =>
        (a.sortOrder ?? 999) - (b.sortOrder ?? 999) ||
        a.label.localeCompare(b.label),
    );
  }, [themeBrowsePresets]);

  const validBrowseCodes = useMemo(
    () => new Set(sortedBrowsePresets.map((p) => p.code)),
    [sortedBrowsePresets],
  );

  useEffect(() => {
    if (filters.activeCategory === "all") return;
    if (!validBrowseCodes.has(filters.activeCategory)) {
      setFilters((f) => ({ ...f, activeCategory: "all" }));
    }
  }, [filters.activeCategory, validBrowseCodes]);

  const browseLabelByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of sortedBrowsePresets) m.set(p.code, p.label);
    return m;
  }, [sortedBrowsePresets]);

  const dietaryFilterOptions = useMemo(() => {
    const coreI18n: Record<string, string> = {
      vegan: "filters.vegan",
      halal: "filters.halal",
      gluten_free: "filters.glutenFree",
      nut_free: "filters.nutFree",
    };
    const list =
      themeDietaryPresets?.length > 0
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

  const { data: shops, isLoading } = useQuery<Shop[]>({
    queryKey: [
      "all-shops",
      PUBLIC_SHOP_REFS.join(","),
      locLat ?? "none",
      locLon ?? "none",
    ],
    queryFn: async () => {
      if (
        locLat == null ||
        locLon == null ||
        !Number.isFinite(locLat) ||
        !Number.isFinite(locLon)
      ) {
        return [];
      }
      const lat = locLat;
      const lon = locLon;
      const results = await Promise.allSettled(
        PUBLIC_SHOP_REFS.map((ref) => api.public.shops(ref, lat, lon)),
      );
      const merged = results
        .filter(
          (r): r is PromiseFulfilledResult<Shop[]> =>
            r.status === "fulfilled",
        )
        .flatMap((r) => r.value);
      return filterShopsByDeliveryPoint(merged, lat, lon);
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
      queryFn: () =>
        api.public.shopReviews(shop.projectRef, shop.id, { limit: 1 }),
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

  const shopMetaById = useMemo(
    () =>
      buildShopMetaById(
        shops ?? [],
        shopProductsById,
        shopReviewSummaryById,
        locLat ?? null,
        locLon ?? null,
        validBrowseCodes,
      ),
    [
      shops,
      shopProductsById,
      shopReviewSummaryById,
      locLat,
      locLon,
      validBrowseCodes,
    ],
  );

  const filteredShops = useMemo(
    () =>
      filterAndSortShops(
        shops,
        filters,
        shopMetaById,
        shopProductsById,
        browseLabelByCode,
      ),
    [shops, filters, shopMetaById, shopProductsById, browseLabelByCode],
  );

  const advancedActive = isAdvancedFilteringActive(filters);
  const advancedCount = useMemo(() => {
    let n = 0;
    if (filters.selectedCuisines.length) n += filters.selectedCuisines.length;
    if (filters.selectedDietary.length) n += filters.selectedDietary.length;
    if (filters.priceTier !== "all") n += 1;
    if (filters.maxDeliveryMins !== "all") n += 1;
    if (filters.maxMinOrder !== "all") n += 1;
    if (filters.minRating !== "all") n += 1;
    if (filters.maxDistanceKm !== "all") n += 1;
    if (filters.sortBy !== "relevance") n += 1;
    return n;
  }, [filters]);

  const listBusy =
    (!hasDeliveryPoint &&
      (locStatus === "loading" || locStatus === "idle")) ||
    (hasDeliveryPoint && isLoading);

  const productsStillLoading =
    hasDeliveryPoint &&
    !!shops?.length &&
    productQueries.some((q) => q.isLoading);

  const openFiltersModal = useCallback(() => {
    setDraft({ ...filters });
    setFiltersModalOpen(true);
  }, [filters]);

  const applyDraftFilters = useCallback(() => {
    setFilters(draft);
    setFiltersModalOpen(false);
  }, [draft]);

  const clearDraftAdvanced = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      selectedCuisines: [],
      selectedDietary: [],
      priceTier: "all",
      maxDeliveryMins: "all",
      maxMinOrder: "all",
      minRating: "all",
      maxDistanceKm: "all",
      sortBy: "relevance",
    }));
  }, []);

  const sortOptions: { value: BrowseSortOption; labelKey: string }[] = [
    { value: "relevance", labelKey: "filters.relevance" },
    { value: "distance", labelKey: "filters.distance" },
    { value: "rating", labelKey: "filters.rating" },
    { value: "delivery_time", labelKey: "filters.deliveryTime" },
    { value: "min_order", labelKey: "filters.minimumOrder" },
    { value: "name", labelKey: "filters.nameAZ" },
  ];

  const chipColors = (selected: boolean) =>
    selected
      ? {
          backgroundColor: colors.primary,
          borderColor: colors.primary,
          color: colors.primaryForeground,
        }
      : {
          backgroundColor: colors.card,
          borderColor: colors.border,
          color: colors.foreground,
        };

  const renderShop = useCallback(
    ({ item }: { item: Shop }) => {
      const meta = shopMetaById.get(item.id);
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          onPress={() =>
            router.push(`/restaurant/${item.projectRef}?shopId=${item.id}`)
          }
        >
          {item.bannerUrl ? (
            <Image source={{ uri: item.bannerUrl }} style={styles.cardImage} />
          ) : (
            <View style={styles.cardImagePlaceholder}>
              <Ionicons
                name="restaurant-outline"
                size={32}
                color={colors.mutedForeground}
              />
            </View>
          )}
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name}
            </Text>
            {item.description ? (
              <Text style={styles.cardDescription} numberOfLines={2}>
                {item.description}
              </Text>
            ) : null}
            {meta ? (
              <View style={styles.metaRow}>
                {meta.distanceKm != null ? (
                  <View style={styles.metaPill}>
                    <Ionicons
                      name="navigate-outline"
                      size={12}
                      color={colors.mutedForeground}
                    />
                    <Text style={styles.metaPillText}>
                      {meta.distanceKm.toFixed(1)} km
                    </Text>
                  </View>
                ) : null}
                <View style={styles.metaPill}>
                  <Ionicons
                    name="star"
                    size={12}
                    color={colors.mutedForeground}
                  />
                  <Text style={styles.metaPillText}>
                    {meta.rating.toFixed(1)}
                    {meta.reviewCount > 0
                      ? ` (${meta.reviewCount})`
                      : ""}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={colors.mutedForeground}
                  />
                  <Text style={styles.metaPillText}>
                    ~{meta.etaMinutes} min
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [colors.mutedForeground, router, shopMetaById, styles],
  );

  const listHeader = (
    <>
      <View style={styles.topRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={tm("search.backA11y")}
        >
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{tm("search.title")}</Text>
        <TouchableOpacity
          style={styles.filterPill}
          onPress={openFiltersModal}
          accessibilityRole="button"
          accessibilityLabel={t("filters.advancedFilters")}
        >
          <Ionicons
            name="options-outline"
            size={18}
            color={colors.foreground}
          />
          <Text style={styles.filterPillText} numberOfLines={1}>
            {t("filters.advancedFilters")}
          </Text>
          {advancedActive ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{advancedCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={20}
            color={colors.mutedForeground}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={tm("search.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            value={filters.query}
            onChangeText={(query) => setFilters((f) => ({ ...f, query }))}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {filters.query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setFilters((f) => ({ ...f, query: "" }))}
            >
              <Ionicons
                name="close-circle"
                size={20}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardAvoidingView>

      <View style={styles.chipRow}>
        <Text style={styles.sectionLabel}>{t("filters.cuisineType")}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
        >
          <TouchableOpacity
            style={[
              styles.chip,
              {
                backgroundColor: chipColors(filters.activeCategory === "all")
                  .backgroundColor,
                borderColor: chipColors(filters.activeCategory === "all")
                  .borderColor,
              },
            ]}
            onPress={() =>
              setFilters((f) => ({ ...f, activeCategory: "all" }))
            }
          >
            <Text
              style={[
                styles.chipText,
                { color: chipColors(filters.activeCategory === "all").color },
              ]}
            >
              {t("filters.all")}
            </Text>
          </TouchableOpacity>
          {sortedBrowsePresets.map((p) => {
            const selected = filters.activeCategory === p.code;
            const cc = chipColors(selected);
            const imgUrl = p.iconImageUrl?.trim();
            return (
              <TouchableOpacity
                key={p.code}
                style={[
                  styles.chip,
                  {
                    backgroundColor: cc.backgroundColor,
                    borderColor: cc.borderColor,
                  },
                ]}
                onPress={() =>
                  setFilters((f) => ({
                    ...f,
                    activeCategory: selected ? "all" : p.code,
                  }))
                }
              >
                <View style={styles.chipInner}>
                  {imgUrl ? (
                    <Image
                      source={{ uri: imgUrl }}
                      style={styles.chipIcon}
                      resizeMode="cover"
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                  <Text style={[styles.chipText, { color: cc.color }]}>
                    {p.label}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.chipRow}>
        <Text style={styles.sectionLabel}>
          {t("filters.dietaryPreferences")}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
        >
          {dietaryFilterOptions.map((tag) => {
            const selected = filters.selectedDietary.includes(tag.value);
            const cc = chipColors(selected);
            return (
              <TouchableOpacity
                key={tag.value}
                style={[
                  styles.chip,
                  {
                    backgroundColor: cc.backgroundColor,
                    borderColor: cc.borderColor,
                  },
                ]}
                onPress={() =>
                  setFilters((f) => ({
                    ...f,
                    selectedDietary: selected
                      ? f.selectedDietary.filter((x) => x !== tag.value)
                      : [...f.selectedDietary, tag.value],
                  }))
                }
              >
                <Text style={[styles.chipText, { color: cc.color }]}>
                  {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {hasDeliveryPoint && shops
            ? `${filteredShops.length} ${
                filteredShops.length === 1
                  ? t("home.place")
                  : t("home.places")
              }`
            : ""}
        </Text>
        {productsStillLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : null}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <FlatList
        data={listBusy ? [] : filteredShops}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        renderItem={renderShop}
        contentContainerStyle={[
          styles.listContent,
          (listBusy || filteredShops.length === 0) && { flexGrow: 1 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          listBusy ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : !hasDeliveryPoint && locStatus === "denied" ? (
            <View style={styles.center}>
              <Ionicons
                name="location-outline"
                size={48}
                color={colors.mutedForeground}
              />
              <Text style={styles.emptyTitle}>
                {t("home.enableLocation")}
              </Text>
              <Text style={styles.emptyHint}>
                {t("home.enableLocationDesc")}
              </Text>
            </View>
          ) : (
            <View style={styles.center}>
              <Ionicons
                name="restaurant-outline"
                size={48}
                color={colors.mutedForeground}
              />
              <Text style={styles.emptyTitle}>
                {t("home.noRestaurantsFound")}
              </Text>
              <Text style={styles.emptyHint}>
                {filters.query.trim() || advancedActive || filters.activeCategory !== "all"
                  ? t("home.tryDifferentSearch")
                  : t("home.noDeliveryToArea")}
              </Text>
            </View>
          )
        }
      />

      <Modal
        visible={filtersModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setFiltersModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.45)" }]}
            onPress={() => setFiltersModalOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={tCommon("actions.close")}
          />
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom + spacing.sm,
              },
            ]}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomColor: colors.border },
              ]}
            >
              <Text style={styles.modalTitle}>{t("filters.advancedFilters")}</Text>
              <TouchableOpacity
                onPress={() => setFiltersModalOpen(false)}
                hitSlop={12}
              >
                <Ionicons name="close" size={26} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLabel}>{t("filters.sortBy")}</Text>
              {sortOptions.map((opt) => {
                const selected = draft.sortBy === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.optionRow,
                      { borderBottomColor: colors.border },
                    ]}
                    onPress={() =>
                      setDraft((d) => ({ ...d, sortBy: opt.value }))
                    }
                  >
                    <Text style={styles.optionRowText}>{t(opt.labelKey)}</Text>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={colors.primary}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              })}

              <Text style={styles.sectionLabel}>{t("filters.priceRange")}</Text>
              <View style={styles.chipWrap}>
                {(
                  [
                    ["all", t("filters.all")],
                    ["budget", t("filters.budget")],
                    ["mid", t("filters.mid")],
                    ["premium", t("filters.premium")],
                  ] as const
                ).map(([value, label]) => {
                  const selected = draft.priceTier === value;
                  const cc = chipColors(selected);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: cc.backgroundColor,
                          borderColor: cc.borderColor,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          priceTier: value as PriceTierFilter,
                        }))
                      }
                    >
                      <Text style={[styles.chipText, { color: cc.color }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>
                {t("filters.maxDeliveryTime")}
              </Text>
              <View style={styles.chipWrap}>
                {(
                  [
                    ["all", t("filters.any")],
                    ["20", t("filters.minutes", { count: 20 })],
                    ["30", t("filters.minutes", { count: 30 })],
                    ["45", t("filters.minutes", { count: 45 })],
                    ["60", t("filters.minutes", { count: 60 })],
                  ] as const
                ).map(([value, label]) => {
                  const selected = draft.maxDeliveryMins === value;
                  const cc = chipColors(selected);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: cc.backgroundColor,
                          borderColor: cc.borderColor,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          maxDeliveryMins: value as MinsFilter,
                        }))
                      }
                    >
                      <Text style={[styles.chipText, { color: cc.color }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>{t("filters.maxMinOrder")}</Text>
              <View style={styles.chipWrap}>
                {(
                  [
                    ["all", t("filters.any")],
                    ["1000", t("filters.upTo", { amount: 10 })],
                    ["2000", t("filters.upTo", { amount: 20 })],
                    ["3000", t("filters.upTo", { amount: 30 })],
                    ["5000", t("filters.upTo", { amount: 50 })],
                  ] as const
                ).map(([value, label]) => {
                  const selected = draft.maxMinOrder === value;
                  const cc = chipColors(selected);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: cc.backgroundColor,
                          borderColor: cc.borderColor,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          maxMinOrder: value as MinOrderFilter,
                        }))
                      }
                    >
                      <Text style={[styles.chipText, { color: cc.color }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>{t("filters.minRating")}</Text>
              <View style={styles.chipWrap}>
                {(
                  [
                    ["all", t("filters.any")],
                    ["4.0", "4.0+"],
                    ["4.3", "4.3+"],
                    ["4.5", "4.5+"],
                  ] as const
                ).map(([value, label]) => {
                  const selected = draft.minRating === value;
                  const cc = chipColors(selected);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: cc.backgroundColor,
                          borderColor: cc.borderColor,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          minRating: value as RatingFilter,
                        }))
                      }
                    >
                      <Text style={[styles.chipText, { color: cc.color }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>{t("filters.maxDistance")}</Text>
              <View style={styles.chipWrap}>
                {(
                  [
                    ["all", t("filters.any")],
                    ["3", t("filters.km", { count: 3 })],
                    ["5", t("filters.km", { count: 5 })],
                    ["10", t("filters.km", { count: 10 })],
                    ["20", t("filters.km", { count: 20 })],
                  ] as const
                ).map(([value, label]) => {
                  const selected = draft.maxDistanceKm === value;
                  const cc = chipColors(selected);
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: cc.backgroundColor,
                          borderColor: cc.borderColor,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          maxDistanceKm: value as DistanceFilter,
                        }))
                      }
                    >
                      <Text style={[styles.chipText, { color: cc.color }]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>{t("filters.cuisineType")}</Text>
              <View style={styles.chipWrap}>
                {sortedBrowsePresets.map((cuisine) => {
                  const selected = draft.selectedCuisines.includes(cuisine.code);
                  const cc = chipColors(selected);
                  return (
                    <TouchableOpacity
                      key={cuisine.code}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: cc.backgroundColor,
                          borderColor: cc.borderColor,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          selectedCuisines: selected
                            ? d.selectedCuisines.filter(
                                (id) => id !== cuisine.code,
                              )
                            : [...d.selectedCuisines, cuisine.code],
                        }))
                      }
                    >
                      <Text style={[styles.chipText, { color: cc.color }]}>
                        {cuisine.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sectionLabel}>
                {t("filters.dietaryPreferences")}
              </Text>
              <View style={styles.chipWrap}>
                {dietaryFilterOptions.map((tag) => {
                  const selected = draft.selectedDietary.includes(tag.value);
                  const cc = chipColors(selected);
                  return (
                    <TouchableOpacity
                      key={tag.value}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: cc.backgroundColor,
                          borderColor: cc.borderColor,
                        },
                      ]}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          selectedDietary: selected
                            ? d.selectedDietary.filter((x) => x !== tag.value)
                            : [...d.selectedDietary, tag.value],
                        }))
                      }
                    >
                      <Text style={[styles.chipText, { color: cc.color }]}>
                        {tag.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnGhost]}
                onPress={clearDraftAdvanced}
              >
                <Text style={styles.modalBtnGhostText}>
                  {t("filters.clearFilters")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnPrimary]}
                onPress={applyDraftFilters}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {tCommon("actions.done")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

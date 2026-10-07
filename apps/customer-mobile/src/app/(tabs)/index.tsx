import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import type { AppColors } from "@/lib/theme";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  ImageBackground,
  RefreshControl,
  ScrollView,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { HomePromoBannerStrip } from "@/components/home-promo-banners";
import { DeliveryLocationSheet } from "@/components/delivery-location-sheet";
import { HomeProfileSheet } from "@/components/home-profile-sheet";
import { useLocationStore } from "@/stores/location-store";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore } from "@/stores/cart-store";
import { useCurrencyStore } from "@/lib/currency";
import { api } from "@/lib/api";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { Shop } from "@dilivygo/types";
import { resolveProfileAvatarUrl } from "@dilivygo/types";
import { filterShopsByDeliveryPoint } from "@/lib/shop-geofence-filter";
import { PUBLIC_SHOP_REFS } from "@/lib/public-shop-refs";
import { getDistanceKm } from "@/lib/browse-search-helpers";
import { useCyclingSearchPlaceholder } from "@/hooks/use-cycling-search-placeholder";

type HomeCategoryChip = { code: string; label: string; iconImageUrl?: string };

const GRID_GAP = 10;
const H_PAD = spacing.lg;
/** Browse category tiles in the home horizontal list */
const CATEGORY_CARD_SIZE = 112;

/** Fixed shop tile geometry so grid rows stay aligned (banner + body). */
const SHOP_CARD_BANNER_H = 118;
const SHOP_CARD_BODY_H = 126;

const APP_BG = require("../../../assets/appbg.png");

const STICKY_SPRING = {
  stiffness: 280,
  damping: 26,
  mass: 0.85,
  overshootClamping: false,
  useNativeDriver: true as const,
};

function createHomeStyles(c: AppColors) {
  const cardShadow =
    Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.07,
          shadowRadius: 14,
        }
      : { elevation: 3 };

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    heroTopCard: {
      borderRadius: borderRadius.xl + 10,
      overflow: "hidden",
      marginBottom: spacing.md,
      minHeight: 228,
    },
    heroTopCardLight: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    heroTopCardOverlayLight: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: borderRadius.xl + 10,
    },
    heroTopCardImage: {
      borderRadius: borderRadius.xl + 10,
    },
    heroTopCardInner: {
      flex: 1,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: "100%",
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.sm,
    },
    topBarRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
    },
    cartHeaderBtnWrap: {
      position: "relative",
    },
    cartHeaderBtn: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    /** Sticky bar — primary fill; border contrasts with pill + `c.background` in light & dark */
    cartHeaderBadgeChrome: {
      position: "absolute",
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primary,
      borderWidth: 2,
      borderColor: c.border,
    },
    /** Hero image — light pill + dark digits (works for both app themes; avoid c.primary on text in dark theme) */
    cartHeaderBadgeHero: {
      position: "absolute",
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.96)",
      borderWidth: 2,
      borderColor: "rgba(0,0,0,0.14)",
    },
    /** Dark-mode app over dark photo — slightly stronger halo */
    cartHeaderBadgeHeroAppDark: {
      borderColor: "rgba(255,255,255,0.38)",
    },
    cartHeaderBadgeTextChrome: {
      fontSize: 10,
      fontFamily: fonts.bold,
      color: c.primaryForeground,
    },
    cartHeaderBadgeTextHero: {
      fontSize: 10,
      fontFamily: fonts.bold,
      color: "#111111",
    },
    addressTap: {
      flexShrink: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minHeight: 36,
      paddingVertical: 2,
    },
    addressLocationIcon: {
      flexShrink: 0,
    },
    addressTextCol: {
      flex: 1,
      minWidth: 0,
    },
    deliverToValue: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    deliverToValueHero: {
      color: "#FFFFFF",
      fontSize: fontSize.xs,
    },
    profileBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}12`,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    profileBtnHero: {
      borderColor: "rgba(255,255,255,0.35)",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    profileAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
    },
    profileInitial: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bold,
      color: c.foreground,
    },
    profileInitialHero: {
      color: "#FFFFFF",
    },
    editorialBlock: {
      marginBottom: 0,
    },
    heroEyebrow: {
      fontSize: 9,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 1.6,
      marginBottom: 6,
    },
    heroEyebrowHero: {
      color: "rgba(255,255,255,0.72)",
    },
    heroTitle: {
      fontSize: fontSize.xl,
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.6,
      lineHeight: 26,
    },
    heroTitleHero: {
      color: "#FFFFFF",
    },
    heroTitleAccent: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.primary,
      letterSpacing: -0.4,
      lineHeight: 22,
      marginTop: 2,
    },
    heroTitleAccentHero: {
      color: "#F5D565",
    },
    rule: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginTop: spacing.md,
      maxWidth: 40,
    },
    ruleHero: {
      backgroundColor: "rgba(255,255,255,0.38)",
    },
    searchPillTouch: {
      width: "100%",
    },
    searchPillInner: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: borderRadius.full,
      backgroundColor: c.muted,
      paddingVertical: 10,
      paddingLeft: spacing.md,
      paddingRight: spacing.md,
      minHeight: 56,
      borderWidth: 0,
      ...Platform.select({
        ios: {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.09,
          shadowRadius: 16,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    /** Same footprint as `searchGoBubble` so the glyph is optically centered in the pill */
    searchIconSlot: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.sm,
    },
    /** Space between leading search glyph and cycling placeholder */
    searchIconLeading: {
      marginRight: spacing.md,
    },
    searchGoBubble: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
      marginLeft: spacing.xs,
    },
    belowHeroBlock: {
      marginBottom: spacing.md,
    },
    stickyTopBar: {
      paddingTop: 0,
      paddingBottom: spacing.xs,
    },
    stickyChromeSearchGap: {
      marginTop: spacing.xs,
    },
    stickySearchBar: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 40,
      paddingHorizontal: H_PAD,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      backgroundColor: c.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.07,
          shadowRadius: 10,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    searchPlaceholderClip: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      overflow: "hidden",
    },
    searchPlaceholder: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
      letterSpacing: -0.15,
    },
    sectionLabel: {
      marginTop: spacing.xl,
      marginBottom: spacing.md,
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.foreground,
      textTransform: "uppercase",
      letterSpacing: 1.4,
    },
    chipScroll: {
      marginBottom: spacing.md,
      marginHorizontal: -H_PAD,
    },
    chipScrollContent: {
      paddingHorizontal: H_PAD,
      gap: 10,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    chip: {
      width: CATEGORY_CARD_SIZE,
      height: CATEGORY_CARD_SIZE,
      borderRadius: borderRadius.lg,
      borderWidth: 0,
      backgroundColor: c.muted,
      overflow: "hidden",
    },
    chipActive: {
      backgroundColor: c.primary,
    },
    chipText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      color: c.foreground,
      letterSpacing: 0.15,
      textAlign: "center",
      lineHeight: 15,
    },
    chipTextActive: {
      color: c.primaryForeground,
    },
    chipInner: {
      flex: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    chipIcon: {
      width: 52,
      height: 52,
      borderRadius: borderRadius.md,
      backgroundColor: "transparent",
    },
    afterBannersSpacer: {
      height: spacing.md,
    },
    listContent: {
      paddingHorizontal: H_PAD,
      paddingTop: spacing.xs,
      paddingBottom: spacing.xxl,
    },
    columnWrap: {
      gap: GRID_GAP,
      marginBottom: GRID_GAP,
    },
    gridCell: {
      flex: 1,
      minWidth: 0,
    },
    card: {
      height: SHOP_CARD_BANNER_H + SHOP_CARD_BODY_H,
      borderRadius: borderRadius.xl + 8,
      overflow: "hidden",
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      ...cardShadow,
    },
    cardImageWrap: {
      height: 118,
      width: "100%",
      backgroundColor: c.muted,
      position: "relative",
    },
    cardImage: {
      width: "100%",
      height: "100%",
    },
    cardImagePlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    statusBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: borderRadius.sm,
    },
    statusOpen: {
      backgroundColor: `${c.success}22`,
    },
    statusClosed: {
      backgroundColor: `${c.mutedForeground}33`,
    },
    statusBadgeText: {
      fontSize: 9,
      fontFamily: fonts.bold,
      letterSpacing: 0.5,
    },
    statusOpenText: {
      color: c.success,
    },
    statusClosedText: {
      color: c.foreground,
    },
    logoFloat: {
      position: "absolute",
      bottom: -18,
      right: 10,
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.card,
      backgroundColor: c.card,
      overflow: "hidden",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 4,
        },
        android: { elevation: 2 },
        default: {},
      }),
    },
    logoFloatImg: {
      width: "100%",
      height: "100%",
    },
    cardBody: {
      height: SHOP_CARD_BODY_H,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      justifyContent: "flex-start",
    },
    cardTitleBlock: {
      height: 36,
      justifyContent: "center",
      overflow: "hidden",
    },
    cardTitle: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bold,
      color: c.foreground,
      textTransform: "uppercase",
      letterSpacing: 0.35,
      lineHeight: 18,
    },
    cardMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: spacing.sm,
      gap: spacing.sm,
      minHeight: 22,
    },
    ratingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    ratingText: {
      fontSize: 11,
      fontFamily: fonts.semibold,
      color: c.foreground,
    },
    distanceText: {
      flexShrink: 1,
      maxWidth: "48%",
      fontSize: 10,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
      textAlign: "right",
    },
    distanceSlot: {
      minWidth: 44,
      maxWidth: "48%",
      minHeight: 14,
    },
    addressRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 4,
      marginTop: 6,
      minHeight: 28,
      maxHeight: 28,
      overflow: "hidden",
    },
    addressRowPlaceholder: {
      flex: 1,
      minHeight: 28,
    },
    addressText: {
      flex: 1,
      fontSize: 10,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      lineHeight: 14,
    },
    addressPinIcon: {
      marginTop: 1,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: spacing.md,
      paddingVertical: spacing.xxl,
    },
    emptyText: {
      fontSize: fontSize.base,
      color: c.mutedForeground,
    },
    emptyTitle: {
      fontSize: fontSize.lg,
      fontFamily: fonts.bold,
      color: c.foreground,
      textAlign: "center",
    },
    emptyHint: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      textAlign: "center",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      lineHeight: 20,
    },
    locationCta: {
      marginTop: spacing.lg,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.full,
      backgroundColor: c.primary,
    },
    locationCtaText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.primaryForeground,
    },
  });
}

export default function HomeScreen() {
  const router = useRouter();
  const { t } = useTranslation("mobile");
  const { t: tCustomer } = useTranslation("customer");
  const { colors, isDark } = useAppTheme();
  const styles = useThemedStyles(createHomeStyles);
  const { width: windowWidth } = useWindowDimensions();
  const locationRowMaxWidth = windowWidth * 0.5;
  const insets = useSafeAreaInsets();
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  const [activeCategoryCode, setActiveCategoryCode] = useState<string | null>(
    null
  );

  const customer = useAuthStore((s) => s.customer);
  const cartItemCount = useCartStore((s) => s.itemCount());
  const browsePresets = useCurrencyStore((s) => s.browseCategoryPresets);
  const defaultProfilePhotoUrls = useCurrencyStore((s) => s.defaultProfilePhotoUrls);

  const headerProfileUri = useMemo(
    () =>
      resolveProfileAvatarUrl(
        customer?.avatarUrl,
        customer?.id ?? "",
        defaultProfilePhotoUrls
      ),
    [customer?.avatarUrl, customer?.id, defaultProfilePhotoUrls]
  );
  const {
    label: cyclingSearchLabel,
    textAnimatedStyle: cyclingSearchAnimStyle,
  } = useCyclingSearchPlaceholder();

  const locAddress = useLocationStore((s) => s.address);
  const locStatus = useLocationStore((s) => s.status);
  const locLat = useLocationStore((s) => s.lat);
  const locLon = useLocationStore((s) => s.lon);
  const savedAddressId = useLocationStore((s) => s.savedAddressId);

  const addressSummary = useMemo(() => {
    if (locAddress) return locAddress;
    if (locStatus === "loading" && !savedAddressId) {
      return tCustomer("locationPicker.detecting");
    }
    if (locStatus === "granted" && !savedAddressId) {
      return tCustomer("header.currentLocation");
    }
    return tCustomer("header.setLocation");
  }, [locAddress, locStatus, savedAddressId, tCustomer]);

  const hasDeliveryPoint =
    locLat != null &&
    locLon != null &&
    Number.isFinite(locLat) &&
    Number.isFinite(locLon);

  const { data: shops, isLoading, refetch, isRefetching } = useQuery<Shop[]>({
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
        PUBLIC_SHOP_REFS.map((ref) => api.public.shops(ref, lat, lon))
      );
      const merged = results
        .filter(
          (r): r is PromiseFulfilledResult<Shop[]> =>
            r.status === "fulfilled"
        )
        .flatMap((r) => r.value);
      return filterShopsByDeliveryPoint(merged, lat, lon);
    },
    enabled: hasDeliveryPoint,
  });

  const reviewQueries = useQueries({
    queries: (shops ?? []).map((shop) => ({
      queryKey: ["home-shop-reviews-summary", shop.projectRef, shop.id],
      queryFn: () => api.public.shopReviews(shop.projectRef, shop.id, { limit: 1 }),
      enabled: !!shops?.length,
      staleTime: 2 * 60 * 1000,
    })),
  });

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

  const listData = shops ?? [];

  const categoryChips = useMemo((): HomeCategoryChip[] => {
    const seen = new Set<string>();
    const fromShops: HomeCategoryChip[] = [];
    for (const shop of listData) {
      for (const id of shop.browseCategoryIds ?? []) {
        if (seen.has(id)) continue;
        seen.add(id);
        const preset = browsePresets.find((p) => p.code === id);
        const url = preset?.iconImageUrl?.trim();
        const row: HomeCategoryChip = { code: id, label: preset?.label ?? id };
        if (url) row.iconImageUrl = url;
        fromShops.push(row);
      }
    }
    fromShops.sort((a, b) => a.label.localeCompare(b.label));
    const presetOnly: HomeCategoryChip[] = browsePresets
      .filter((p) => !seen.has(p.code))
      .map((p) => {
        const url = p.iconImageUrl?.trim();
        const row: HomeCategoryChip = { code: p.code, label: p.label };
        if (url) row.iconImageUrl = url;
        return row;
      });
    return [{ code: "__all__", label: t("home.categoryAll") }].concat(
      fromShops,
      presetOnly.slice(0, 12)
    );
  }, [browsePresets, listData, t]);

  const filteredShops = useMemo(() => {
    if (!activeCategoryCode || activeCategoryCode === "__all__") {
      return listData;
    }
    return listData.filter((s) =>
      (s.browseCategoryIds ?? []).includes(activeCategoryCode)
    );
  }, [listData, activeCategoryCode]);

  const onRefreshShops = useCallback(() => {
    if (!hasDeliveryPoint) return;
    void refetch();
  }, [hasDeliveryPoint, refetch]);

  const listBusy =
    (!hasDeliveryPoint &&
      (locStatus === "loading" || locStatus === "idle")) ||
    (hasDeliveryPoint && isLoading);

  const showEmptyState = !listBusy && filteredShops.length === 0;
  const showCategoryEmpty =
    !listBusy &&
    listData.length > 0 &&
    filteredShops.length === 0 &&
    activeCategoryCode &&
    activeCategoryCode !== "__all__";

  const heroBlockHeight = useRef(0);
  const stickyActiveRef = useRef(false);
  const [stickySearch, setStickySearch] = useState(false);

  const stickyBarOpacity = useRef(new Animated.Value(0)).current;
  const stickyBarTranslateY = useRef(new Animated.Value(-22)).current;
  const stickyBarScale = useRef(new Animated.Value(0.94)).current;
  const inFlowSearchOpacity = useRef(new Animated.Value(1)).current;
  const stickyAnimSkipFirst = useRef(true);

  useEffect(() => {
    if (stickyAnimSkipFirst.current) {
      stickyAnimSkipFirst.current = false;
      return;
    }
    if (stickySearch) {
      Animated.parallel([
        Animated.spring(stickyBarTranslateY, { toValue: 0, ...STICKY_SPRING }),
        Animated.spring(stickyBarScale, {
          toValue: 1,
          stiffness: 320,
          damping: 22,
          mass: 0.7,
          useNativeDriver: true,
        }),
        Animated.timing(stickyBarOpacity, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(inFlowSearchOpacity, {
          toValue: 0,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(stickyBarTranslateY, {
          toValue: -20,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stickyBarScale, {
          toValue: 0.94,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(stickyBarOpacity, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(70),
          Animated.timing(inFlowSearchOpacity, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [stickySearch]);

  const onHeroBlockLayout = useCallback((e: LayoutChangeEvent) => {
    heroBlockHeight.current = e.nativeEvent.layout.height;
  }, []);

  const onListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const h = heroBlockHeight.current;
      if (h < 32) {
        if (stickyActiveRef.current) {
          stickyActiveRef.current = false;
          setStickySearch(false);
        }
        return;
      }
      const show = y >= h - 2;
      if (show !== stickyActiveRef.current) {
        stickyActiveRef.current = show;
        setStickySearch(show);
      }
    },
    []
  );

  const renderHomeTopChrome = useCallback(
    (forStickyStrip: boolean) => {
      const onHeroImage = !forStickyStrip;
      return (
        <View
          style={[styles.topBar, forStickyStrip && styles.stickyTopBar]}
        >
          <TouchableOpacity
            style={[
              styles.addressTap,
              { maxWidth: locationRowMaxWidth },
            ]}
            onPress={() => setLocationSheetOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${t("home.deliverTo")}: ${addressSummary}`}
          >
            <Ionicons
              name="location"
              size={17}
              color={
                onHeroImage && isDark
                  ? "rgba(255,255,255,0.92)"
                  : colors.primary
              }
              style={styles.addressLocationIcon}
            />
            <View style={styles.addressTextCol}>
              <Text
                style={[
                  styles.deliverToValue,
                  onHeroImage && isDark && styles.deliverToValueHero,
                ]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {addressSummary}
              </Text>
            </View>
            <Ionicons
              name="chevron-down"
              size={15}
              color={
                onHeroImage && isDark
                  ? "rgba(255,255,255,0.78)"
                  : colors.mutedForeground
              }
            />
          </TouchableOpacity>
          <View style={styles.topBarRight}>
            <View style={styles.cartHeaderBtnWrap}>
              <TouchableOpacity
                style={styles.cartHeaderBtn}
                onPress={() => router.push("/(tabs)/cart" as any)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={
                  cartItemCount > 0
                    ? t("home.headerCartA11yCount", { count: cartItemCount })
                    : t("tabs.cart")
                }
              >
                <Ionicons
                  name="cart-outline"
                  size={20}
                  color={
                    onHeroImage && isDark ? "#FFFFFF" : colors.primary
                  }
                />
              </TouchableOpacity>
              {cartItemCount > 0 ? (
                <View
                  style={[
                    onHeroImage ? styles.cartHeaderBadgeHero : styles.cartHeaderBadgeChrome,
                    onHeroImage && isDark && styles.cartHeaderBadgeHeroAppDark,
                  ]}
                >
                  <Text
                    style={
                      onHeroImage
                        ? styles.cartHeaderBadgeTextHero
                        : styles.cartHeaderBadgeTextChrome
                    }
                    numberOfLines={1}
                  >
                    {cartItemCount > 99 ? "99+" : String(cartItemCount)}
                  </Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              style={[
                styles.profileBtn,
                onHeroImage && isDark && styles.profileBtnHero,
              ]}
              onPress={() => setProfileSheetOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t("home.profileDrawerOpenA11y")}
            >
              {headerProfileUri ? (
                <Image
                  source={{ uri: headerProfileUri }}
                  style={styles.profileAvatar}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <Text
                  style={[
                    styles.profileInitial,
                    onHeroImage && isDark && styles.profileInitialHero,
                  ]}
                >
                  {(customer?.name?.[0] || customer?.email?.[0] || "G").toUpperCase()}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [
      addressSummary,
      cartItemCount,
      colors.mutedForeground,
      colors.primary,
      customer?.email,
      customer?.name,
      headerProfileUri,
      setProfileSheetOpen,
      isDark,
      locationRowMaxWidth,
      router,
      styles,
      t,
    ]
  );

  const renderHomeSearchPill = useCallback(
    () => (
      <TouchableOpacity
        style={styles.searchPillTouch}
        onPress={() => router.push("/search" as any)}
        activeOpacity={0.92}
        accessibilityRole="button"
        accessibilityLabel={t("home.searchBarA11y")}
      >
        <View style={styles.searchPillInner}>
          <Ionicons
            name="search"
            size={22}
            color={colors.mutedForeground}
            style={styles.searchIconLeading}
          />
          <View style={styles.searchPlaceholderClip}>
            <Animated.Text
              style={[
                styles.searchPlaceholder,
                cyclingSearchAnimStyle,
              ]}
              numberOfLines={1}
            >
              {cyclingSearchLabel}
            </Animated.Text>
          </View>
          <View style={styles.searchGoBubble}>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={colors.primary}
            />
          </View>
        </View>
      </TouchableOpacity>
    ),
    [
      colors.mutedForeground,
      colors.primary,
      cyclingSearchAnimStyle,
      cyclingSearchLabel,
      router,
      styles,
      t,
    ]
  );

  const listHeader = useCallback(
    () => (
      <>
        <View onLayout={onHeroBlockLayout}>
          <ImageBackground
          source={APP_BG}
          style={[styles.heroTopCard, !isDark && styles.heroTopCardLight]}
          imageStyle={styles.heroTopCardImage}
          resizeMode="cover"
        >
          {!isDark ? (
            <LinearGradient
              pointerEvents="none"
              colors={[
                "rgba(255,255,255,0.88)",
                "rgba(255,255,255,0.5)",
                "rgba(255,255,255,0.12)",
                "transparent",
              ]}
              locations={[0, 0.28, 0.52, 0.72]}
              style={styles.heroTopCardOverlayLight}
            />
          ) : null}
          <View style={styles.heroTopCardInner}>
            <Animated.View
              style={{ opacity: inFlowSearchOpacity }}
              pointerEvents={stickySearch ? "none" : "auto"}
            >
              {renderHomeTopChrome(false)}
            </Animated.View>

            <View style={styles.editorialBlock}>
              <Text
                style={[
                  styles.heroEyebrow,
                  isDark && styles.heroEyebrowHero,
                ]}
              >
                {t("home.heroEyebrow")}
              </Text>
              <Text style={[styles.heroTitle, isDark && styles.heroTitleHero]}>
                {t("home.heroTitleLead")}
              </Text>
              <Text
                style={[
                  styles.heroTitleAccent,
                  isDark && styles.heroTitleAccentHero,
                ]}
              >
                {t("home.heroTitleAccent")}
              </Text>
              <View style={[styles.rule, isDark && styles.ruleHero]} />
            </View>
          </View>
        </ImageBackground>
        </View>

        <Animated.View
          style={[
            styles.belowHeroBlock,
            { opacity: inFlowSearchOpacity },
          ]}
          pointerEvents={stickySearch ? "none" : "auto"}
        >
          {renderHomeSearchPill()}
        </Animated.View>

        <HomePromoBannerStrip placement="home_below_hero" omitOuterGutter />
        <HomePromoBannerStrip
          placement="home_promotions"
          showPromotionsHeading
          omitOuterGutter
        />
        <View style={styles.afterBannersSpacer} />

        <Text style={styles.sectionLabel}>{t("home.sectionPlaces")}</Text>

        {categoryChips.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipScrollContent}
          >
            {categoryChips.map((chip) => {
              const active =
                chip.code === "__all__"
                  ? !activeCategoryCode || activeCategoryCode === "__all__"
                  : activeCategoryCode === chip.code;
              const imgUrl =
                chip.code === "__all__" ? undefined : chip.iconImageUrl;
              return (
                <TouchableOpacity
                  key={chip.code}
                  onPress={() =>
                    setActiveCategoryCode(
                      chip.code === "__all__" ? "__all__" : chip.code
                    )
                  }
                  activeOpacity={0.88}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <View style={styles.chipInner}>
                    {imgUrl ? (
                      <Image
                        source={{ uri: imgUrl }}
                        style={styles.chipIcon}
                        resizeMode="contain"
                        accessibilityIgnoresInvertColors
                      />
                    ) : (
                      <Ionicons
                        name="apps-outline"
                        size={34}
                        color={
                          active
                            ? colors.primaryForeground
                            : colors.mutedForeground
                        }
                      />
                    )}
                    <Text
                      style={[
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                      numberOfLines={2}
                    >
                      {chip.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
      </>
    ),
    [
      activeCategoryCode,
      addressSummary,
      categoryChips,
      colors.mutedForeground,
      colors.primary,
      colors.primaryForeground,
      isDark,
      inFlowSearchOpacity,
      onHeroBlockLayout,
      renderHomeSearchPill,
      renderHomeTopChrome,
      router,
      stickySearch,
      styles,
      t,
    ]
  );

  const listEmpty = useCallback(() => {
    if (listBusy) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          {!hasDeliveryPoint ? (
            <Text style={styles.emptyHint}>
              {tCustomer("locationPicker.detecting")}
            </Text>
          ) : null}
        </View>
      );
    }
    if (!hasDeliveryPoint && locStatus === "denied") {
      return (
        <View style={styles.center}>
          <Ionicons
            name="location-outline"
            size={48}
            color={colors.mutedForeground}
          />
          <Text style={styles.emptyTitle}>
            {tCustomer("home.enableLocation")}
          </Text>
          <Text style={styles.emptyHint}>
            {tCustomer("home.enableLocationDesc")}
          </Text>
          <TouchableOpacity
            style={styles.locationCta}
            onPress={() => setLocationSheetOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={tCustomer("header.setLocation")}
          >
            <Text style={styles.locationCtaText}>
              {t("home.addDeliveryAddress")}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (showCategoryEmpty) {
      return (
        <View style={styles.center}>
          <Ionicons
            name="filter-outline"
            size={44}
            color={colors.mutedForeground}
          />
          <Text style={styles.emptyTitle}>{t("home.noCategoryMatch")}</Text>
          <TouchableOpacity
            style={styles.locationCta}
            onPress={() => setActiveCategoryCode("__all__")}
            activeOpacity={0.85}
          >
            <Text style={styles.locationCtaText}>{t("home.categoryAll")}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Ionicons
          name="restaurant-outline"
          size={48}
          color={colors.mutedForeground}
        />
        <Text style={styles.emptyTitle}>
          {tCustomer("home.noRestaurantsFound")}
        </Text>
        <Text style={styles.emptyHint}>
          {tCustomer("home.noDeliveryToArea")}
        </Text>
      </View>
    );
  }, [
    colors.mutedForeground,
    colors.primary,
    hasDeliveryPoint,
    listBusy,
    locStatus,
    setLocationSheetOpen,
    showCategoryEmpty,
    styles,
    t,
    tCustomer,
  ]);

  const renderShopCard = useCallback(
    ({ item }: { item: Shop }) => {
      const dist = getDistanceKm(locLat, locLon, item.lat, item.lon);
      const distLabel =
        dist != null
          ? dist < 1
            ? `${Math.round(dist * 1000)} m`
            : `${dist.toFixed(1)} km`
          : null;
      const summary = shopReviewSummaryById.get(item.id);
      const reviewCount = summary?.reviewCount ?? 0;
      const avgRating = summary?.averageRating;
      const hasReviewRating =
        reviewCount > 0 && typeof avgRating === "number" && avgRating > 0;
      const ratingLabel = hasReviewRating
        ? avgRating.toFixed(1)
        : tCustomer("storeMenu.newRating", { defaultValue: "New" });
      const open = item.isOpen !== false;

      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.88}
          onPress={() =>
            router.push(`/restaurant/${item.projectRef}?shopId=${item.id}`)
          }
        >
          <View style={styles.cardImageWrap}>
            {item.bannerUrl ? (
              <Image
                source={{ uri: item.bannerUrl }}
                style={styles.cardImage}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Ionicons
                  name="restaurant-outline"
                  size={36}
                  color={colors.mutedForeground}
                />
              </View>
            )}
            <View
              style={[
                styles.statusBadge,
                open ? styles.statusOpen : styles.statusClosed,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  open ? styles.statusOpenText : styles.statusClosedText,
                ]}
              >
                {open
                  ? t("restaurant.openNow").toUpperCase()
                  : t("restaurant.closed").toUpperCase()}
              </Text>
            </View>
            {item.logoUrl ? (
              <View style={styles.logoFloat}>
                <Image
                  source={{ uri: item.logoUrl }}
                  style={styles.logoFloatImg}
                  resizeMode="cover"
                />
              </View>
            ) : null}
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTitleBlock}>
              <Text
                style={styles.cardTitle}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {item.name}
              </Text>
            </View>
            <View style={styles.cardMetaRow}>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={13} color={colors.warning} />
                <Text style={styles.ratingText}>{ratingLabel}</Text>
              </View>
              {distLabel ? (
                <Text
                  style={styles.distanceText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {distLabel}
                </Text>
              ) : (
                <View style={styles.distanceSlot} />
              )}
            </View>
            <View style={styles.addressRow}>
              {item.address ? (
                <>
                  <Ionicons
                    name="location-outline"
                    size={12}
                    color={colors.mutedForeground}
                    style={styles.addressPinIcon}
                  />
                  <Text
                    style={styles.addressText}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {item.address}
                  </Text>
                </>
              ) : (
                <View style={styles.addressRowPlaceholder} />
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, locLat, locLon, router, shopReviewSummaryById, styles, t, tCustomer]
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <DeliveryLocationSheet
        visible={locationSheetOpen}
        onClose={() => setLocationSheetOpen(false)}
      />
      <HomeProfileSheet
        visible={profileSheetOpen}
        onClose={() => setProfileSheetOpen(false)}
      />
      <View style={{ flex: 1 }}>
        <Animated.View
          style={[
            styles.stickySearchBar,
            {
              opacity: stickyBarOpacity,
              transform: [
                { translateY: stickyBarTranslateY },
                { scale: stickyBarScale },
              ],
            },
          ]}
          pointerEvents={stickySearch ? "box-none" : "none"}
          collapsable={false}
        >
          {renderHomeTopChrome(true)}
          <View style={styles.stickyChromeSearchGap}>
            {renderHomeSearchPill()}
          </View>
        </Animated.View>
        <FlatList
          data={filteredShops}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrap}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={[
            styles.listContent,
            {
              paddingBottom: insets.bottom + spacing.xxl,
              flexGrow: listBusy || showEmptyState ? 1 : undefined,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          refreshControl={
            hasDeliveryPoint ? (
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefreshShops}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
          renderItem={({ item }) => (
            <View style={styles.gridCell}>{renderShopCard({ item })}</View>
          )}
        />
      </View>
    </SafeAreaView>
  );
}

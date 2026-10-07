import { useMemo, useCallback, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { formatPrice, useCurrencyStore } from "@/lib/currency";
import { useCartStore } from "@/stores/cart-store";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import {
  DIETARY_TAG_OPTIONS,
  type Product,
  type Shop,
  type SelectedModifier,
} from "@dilivygo/types";
import { MenuProductPickerModal } from "@/components/menu-product-picker-modal";

const HERO_HEIGHT = 288;
const LOGO_SIZE = 76;
const MENU_IMAGE_H = 148;
const MENU_FAB = 44;

function chunkPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

type MenuSection = {
  title: string;
  data: Product[][];
  sectionIndex: number;
};

function dietaryTagLabel(tag: string) {
  return DIETARY_TAG_OPTIONS.find((opt) => opt.value === tag)?.label ?? tag.replace(/_/g, " ");
}

function dietaryFooterIcon(tag: string): keyof typeof Ionicons.glyphMap {
  switch (tag) {
    case "vegan":
      return "leaf-outline";
    case "halal":
      return "sparkles-outline";
    case "gluten_free":
      return "nutrition-outline";
    case "nut_free":
      return "shield-checkmark-outline";
    default:
      return "pricetag-outline";
  }
}

function dietaryFooterColor(tag: string, muted: string): string {
  switch (tag) {
    case "vegan":
      return "#16a34a";
    case "halal":
      return "#d97706";
    case "gluten_free":
      return "#b45309";
    case "nut_free":
      return "#ea580c";
    default:
      return muted;
  }
}

function createRestaurantStyles(c: AppColors) {
  const cardShadow =
    Platform.OS === "ios"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.07,
          shadowRadius: 20,
        }
      : { elevation: 5 };

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: c.background,
    },
    center: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xxl,
      gap: spacing.md,
    },
    emptyText: {
      fontSize: fontSize.lg,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
      textAlign: "center",
    },
    emptyHint: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      textAlign: "center",
      marginTop: spacing.sm,
      lineHeight: 20,
      paddingHorizontal: spacing.lg,
    },
    listContent: {
      paddingBottom: spacing.xxl + 24,
    },
    heroWrap: {
      height: HERO_HEIGHT,
      width: "100%",
      position: "relative",
    },
    heroImage: {
      ...StyleSheet.absoluteFillObject,
      width: "100%",
      height: "100%",
    },
    heroPlaceholder: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.muted,
    },
    heroGradient: {
      ...StyleSheet.absoluteFillObject,
    },
    topBar: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      zIndex: 4,
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(0,0,0,0.42)",
      alignItems: "center",
      justifyContent: "center",
    },
    logoWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: -LOGO_SIZE / 2 + 8,
      alignItems: "center",
      zIndex: 3,
    },
    logo: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: c.card,
      backgroundColor: c.card,
      ...cardShadow,
    },
    logoPlaceholder: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      borderRadius: 20,
      borderWidth: 3,
      borderColor: c.card,
      backgroundColor: c.muted,
      alignItems: "center",
      justifyContent: "center",
      ...cardShadow,
    },
    infoSheet: {
      marginTop: LOGO_SIZE / 2 + spacing.sm,
      marginHorizontal: spacing.lg,
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      ...cardShadow,
    },
    shopName: {
      fontSize: fontSize["3xl"],
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.8,
      lineHeight: 36,
      textAlign: "center",
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    statusPill: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
      gap: 6,
    },
    statusPillOpen: {
      backgroundColor: `${c.success}18`,
    },
    statusPillClosed: {
      backgroundColor: c.muted,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    statusDotOpen: {
      backgroundColor: c.success,
    },
    statusDotClosed: {
      backgroundColor: c.mutedForeground,
    },
    statusLabel: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      letterSpacing: 0.2,
    },
    statusLabelOpen: {
      color: c.success,
    },
    statusLabelClosed: {
      color: c.mutedForeground,
    },
    addressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: "100%",
      paddingHorizontal: spacing.sm,
    },
    addressText: {
      flex: 1,
      fontSize: fontSize.sm,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
      lineHeight: 20,
    },
    minOrderPill: {
      marginTop: spacing.md,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: spacing.md,
      paddingVertical: 8,
      borderRadius: borderRadius.lg,
      backgroundColor: c.muted,
    },
    minOrderText: {
      fontSize: fontSize.xs,
      fontFamily: fonts.semibold,
      color: c.foreground,
      letterSpacing: 0.15,
    },
    description: {
      marginTop: spacing.lg,
      fontSize: fontSize.base,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      lineHeight: 24,
      textAlign: "center",
    },
    sectionBlock: {
      marginTop: spacing.xl + 4,
      paddingHorizontal: spacing.lg,
    },
    sectionKicker: {
      fontSize: 10,
      fontFamily: fonts.semibold,
      color: c.mutedForeground,
      letterSpacing: 2.4,
      textTransform: "uppercase",
      marginBottom: spacing.xs,
    },
    sectionTitle: {
      fontSize: fontSize["2xl"],
      fontFamily: fonts.bold,
      color: c.foreground,
      letterSpacing: -0.4,
    },
    menuGridRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: spacing.sm + 2,
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.md,
    },
    menuTileCol: {
      flex: 1,
      minWidth: 0,
    },
    menuTile: {
      width: "100%",
      flex: 1,
      flexDirection: "column",
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}14`,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
        },
        android: { elevation: 1 },
        default: {},
      }),
    },
    menuTilePadTop: {
      paddingHorizontal: spacing.sm + 2,
      paddingTop: spacing.sm + 2,
    },
    menuImageWell: {
      height: MENU_IMAGE_H,
      borderRadius: borderRadius.xl,
      backgroundColor: c.muted,
      overflow: "hidden",
    },
    menuImage: {
      width: "100%",
      height: "100%",
    },
    menuImagePlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    menuBadgeRow: {
      position: "absolute",
      left: spacing.sm,
      bottom: spacing.sm,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      maxWidth: "72%",
    },
    menuBadgePill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: borderRadius.full,
      backgroundColor: `${c.card}F0`,
    },
    menuBadgeText: {
      fontSize: 9,
      fontFamily: fonts.semibold,
      color: c.foreground,
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    menuFabSlot: {
      alignItems: "flex-end",
      paddingRight: 2,
      marginTop: -(MENU_FAB / 2),
      zIndex: 4,
    },
    menuFabCircle: {
      width: MENU_FAB,
      height: MENU_FAB,
      borderRadius: MENU_FAB / 2,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}22`,
      alignItems: "center",
      justifyContent: "center",
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.12,
          shadowRadius: 6,
        },
        android: { elevation: 3 },
        default: {},
      }),
    },
    menuFabStepper: {
      flexDirection: "row",
      alignItems: "center",
      height: MENU_FAB,
      paddingHorizontal: 4,
      borderRadius: MENU_FAB / 2,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}22`,
      gap: 2,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.12,
          shadowRadius: 6,
        },
        android: { elevation: 3 },
        default: {},
      }),
    },
    menuFabStepBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    menuFabQty: {
      minWidth: 22,
      textAlign: "center",
      fontSize: fontSize.sm,
      fontFamily: fonts.bold,
      color: c.foreground,
    },
    menuTileBody: {
      flex: 1,
      paddingHorizontal: spacing.sm + 2,
      paddingBottom: spacing.sm + 2,
      paddingTop: 2,
    },
    menuTileFlexSpacer: {
      flex: 1,
      minHeight: 4,
    },
    menuTilePrice: {
      fontSize: fontSize.lg,
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.4,
    },
    menuTileTitle: {
      marginTop: 4,
      fontSize: fontSize.sm,
      fontFamily: fonts.semibold,
      color: c.foreground,
      lineHeight: 19,
    },
    menuTileDesc: {
      marginTop: 2,
      fontSize: 11,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      lineHeight: 15,
    },
    menuTileFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingTop: spacing.sm,
      minHeight: 18,
    },
    floatingCartBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: borderRadius.xl + 4,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}14`,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
        },
        android: { elevation: 8 },
        default: {},
      }),
    },
    floatingCartTextCol: {
      flex: 1,
      minWidth: 0,
    },
    floatingCartTitle: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bold,
      color: c.foreground,
    },
    floatingCartSub: {
      marginTop: 2,
      fontSize: fontSize.xs,
      fontFamily: fonts.medium,
      color: c.mutedForeground,
    },
    floatingCartCta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      borderRadius: borderRadius.lg,
      backgroundColor: c.primary,
    },
    floatingCartCtaText: {
      fontSize: fontSize.sm,
      fontFamily: fonts.bold,
      color: c.primaryForeground,
    },
  });
}

export default function RestaurantScreen() {
  const { ref, shopId } = useLocalSearchParams<{ ref: string; shopId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("mobile");
  const { colors, isDark } = useAppTheme();
  const styles = useThemedStyles(createRestaurantStyles);

  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartShopId = useCartStore((s) => s.shopId);
  const multiShopCartEnabled = useCurrencyStore((s) => s.multiShopCartEnabled);
  const setProjectRef = useCartStore((s) => s.setProjectRef);
  const setShopId = useCartStore((s) => s.setShopId);
  const setCurrency = useCartStore((s) => s.setCurrency);
  const clear = useCartStore((s) => s.clear);

  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);

  const { data: shop, isLoading: loadingShop } = useQuery<Shop>({
    queryKey: ["shop", ref, shopId],
    queryFn: () => api.public.shopDetail(ref!, shopId!),
    enabled: !!ref && !!shopId,
  });

  const { data: products, isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["products", ref, shopId],
    queryFn: () =>
      shopId
        ? api.public.shopProducts(ref!, shopId)
        : api.public.products(ref!),
    enabled: !!ref,
  });

  const sections = useMemo((): MenuSection[] => {
    if (!products) return [];
    const grouped: Record<string, Product[]> = {};
    for (const p of products) {
      if (!p.available) continue;
      const cat = p.category || "Other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }
    return Object.entries(grouped).map(([title, data], sectionIndex) => ({
      title,
      data: chunkPairs(data),
      sectionIndex,
    }));
  }, [products]);

  const gradientBottom = useMemo(
    () => (isDark ? "rgba(9,9,11,0.97)" : "rgba(255,255,255,0.98)"),
    [isDark]
  );

  const productNeedsPicker = useCallback((product: Product) => {
    const hasVariants = (product.variants?.length ?? 0) > 0;
    const hasModifiers =
      product.modifierGroups?.some((g) => (g.options?.length ?? 0) > 0) ?? false;
    return hasVariants || hasModifiers;
  }, []);

  const sumQtyForProduct = useCallback(
    (product: Product) => {
      if (!multiShopCartEnabled && cartShopId !== shopId) return 0;
      return items
        .filter((i) => {
          if (i.productId !== product.id) return false;
          const lineShop = i.shopId ?? cartShopId;
          return multiShopCartEnabled ? lineShop === shopId : true;
        })
        .reduce((s, i) => s + i.quantity, 0);
    },
    [items, cartShopId, shopId, multiShopCartEnabled]
  );

  const handleAddToCart = useCallback(
    (product: Product) => {
      if (productNeedsPicker(product)) {
        setPickerProduct(product);
        return;
      }

      const linePayload = {
        id: `local-${Date.now()}`,
        sessionId: "",
        productId: product.id,
        name: product.name,
        quantity: 1,
        unitPriceCents: product.priceCents,
        createdAt: new Date().toISOString(),
        ...(shopId && ref
          ? { shopId, projectRef: ref, shopName: shop?.name }
          : {}),
      };

      if (!multiShopCartEnabled && cartShopId && shopId && cartShopId !== shopId) {
        Alert.alert(
          "Different shop",
          "Your cart has items from another shop. Clear cart and add this item?",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Clear & Add",
              style: "destructive",
              onPress: () => {
                clear();
                setProjectRef(ref!);
                if (shopId) {
                  setShopId(shopId);
                  if (shop?.currency) setCurrency(shop.currency.toUpperCase());
                }
                addItem(linePayload);
              },
            },
          ]
        );
        return;
      }

      setProjectRef(ref!);
      if (shopId) {
        setShopId(shopId);
        if (shop?.currency) setCurrency(shop.currency.toUpperCase());
      }
      addItem(linePayload);
    },
    [
      addItem,
      cartShopId,
      clear,
      multiShopCartEnabled,
      ref,
      setCurrency,
      setProjectRef,
      setShopId,
      shop?.currency,
      shop?.name,
      shopId,
      productNeedsPicker,
    ]
  );

  const handlePickerAdd = useCallback(
    (data: {
      quantity: number;
      unitPriceCents: number;
      selectedModifiers: SelectedModifier[];
      productVariantId?: string;
      lineName?: string;
    }) => {
      if (!pickerProduct || !ref) return;
      const linePayload = {
        id: `local-${Date.now()}`,
        sessionId: "",
        productId: pickerProduct.id,
        productVariantId: data.productVariantId,
        name: data.lineName ?? pickerProduct.name,
        quantity: data.quantity,
        unitPriceCents: data.unitPriceCents,
        selectedModifiers: data.selectedModifiers,
        createdAt: new Date().toISOString(),
        ...(shopId
          ? { shopId, projectRef: ref, shopName: shop?.name }
          : {}),
      };

      if (!multiShopCartEnabled && cartShopId && shopId && cartShopId !== shopId) {
        clear();
        setProjectRef(ref);
        if (shopId) {
          setShopId(shopId);
          if (shop?.currency) setCurrency(shop.currency.toUpperCase());
        }
        addItem(linePayload);
        setPickerProduct(null);
        return;
      }

      setProjectRef(ref);
      if (shopId) {
        setShopId(shopId);
        if (shop?.currency) setCurrency(shop.currency.toUpperCase());
      }
      addItem(linePayload);
      setPickerProduct(null);
    },
    [
      pickerProduct,
      ref,
      shopId,
      shop?.name,
      shop?.currency,
      multiShopCartEnabled,
      cartShopId,
      clear,
      setProjectRef,
      setShopId,
      setCurrency,
      addItem,
    ]
  );

  const isLoading = loadingShop || loadingProducts;
  const currencyU = shop?.currency?.toUpperCase();

  const shopCartLines = useMemo(() => {
    return items.filter((i) => {
      if (shopId) {
        const lineShop = i.shopId ?? cartShopId;
        if (multiShopCartEnabled) return lineShop === shopId;
        return cartShopId === shopId && lineShop === shopId;
      }
      if (!ref) return false;
      const lineRef = i.projectRef ?? ref;
      return lineRef === ref;
    });
  }, [items, shopId, cartShopId, multiShopCartEnabled, ref]);

  const shopItemCount = useMemo(
    () => shopCartLines.reduce((sum, i) => sum + i.quantity, 0),
    [shopCartLines]
  );

  const shopSubtotalCents = useMemo(
    () => shopCartLines.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
    [shopCartLines]
  );

  const openCart = useCallback(() => {
    router.push("/(tabs)/cart" as any);
  }, [router]);

  const cartCountLabel =
    shopItemCount === 1
      ? t("restaurant.oneItemInCart")
      : t("restaurant.nItemsInCart", { count: shopItemCount });

  const listBottomPad = spacing.xxl + 24 + (shopItemCount > 0 ? 76 + insets.bottom : 0);

  const cartLineForProduct = useCallback(
    (product: Product) => {
      if (!multiShopCartEnabled && cartShopId !== shopId) return undefined;
      if (productNeedsPicker(product)) return undefined;
      return items.find(
        (i) =>
          i.productId === product.id &&
          (multiShopCartEnabled ? (i.shopId ?? cartShopId) === shopId : true) &&
          (!i.selectedModifiers || i.selectedModifiers.length === 0)
      );
    },
    [items, cartShopId, shopId, multiShopCartEnabled, productNeedsPicker]
  );

  const renderMenuTile = useCallback(
    (product: Product) => {
      const complex = productNeedsPicker(product);
      const line = cartLineForProduct(product);
      const qty = complex ? sumQtyForProduct(product) : line?.quantity ?? 0;
      const primaryTag = product.dietaryTags?.[0];
      const badgeTags = product.dietaryTags?.slice(0, 2) ?? [];
      const footerColor = primaryTag
        ? dietaryFooterColor(primaryTag, colors.mutedForeground)
        : colors.mutedForeground;

      return (
        <View style={styles.menuTile}>
          <View style={styles.menuTilePadTop}>
            <View style={styles.menuImageWell}>
              {product.imageUrl ? (
                <Image
                  source={{ uri: product.imageUrl }}
                  style={styles.menuImage}
                  resizeMode="cover"
                  accessible={false}
                />
              ) : (
                <View style={[styles.menuImage, styles.menuImagePlaceholder]}>
                  <Ionicons name="image-outline" size={36} color={colors.mutedForeground} />
                </View>
              )}
              {badgeTags.length > 0 ? (
                <View style={styles.menuBadgeRow}>
                  {badgeTags.map((tag) => (
                    <View key={tag} style={styles.menuBadgePill}>
                      <Text style={styles.menuBadgeText}>{dietaryTagLabel(tag)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={styles.menuFabSlot}>
              {complex ? (
                <View style={{ alignItems: "center", gap: 6 }}>
                  {qty > 0 ? (
                    <View
                      style={{
                        minWidth: 22,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 10,
                        backgroundColor: colors.primary,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: fonts.bold,
                          fontSize: 12,
                          color: colors.primaryForeground,
                          textAlign: "center",
                        }}
                      >
                        {qty}
                      </Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={styles.menuFabCircle}
                    onPress={() => setPickerProduct(product)}
                    activeOpacity={0.88}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose options for ${product.name}`}
                  >
                    <Ionicons name="add" size={24} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
              ) : qty > 0 ? (
                <View style={styles.menuFabStepper}>
                  <TouchableOpacity
                    style={styles.menuFabStepBtn}
                    onPress={() => line && updateQuantity(line.id, qty - 1)}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease quantity"
                  >
                    <Ionicons name="remove" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={styles.menuFabQty}>{qty}</Text>
                  <TouchableOpacity
                    style={styles.menuFabStepBtn}
                    onPress={() => handleAddToCart(product)}
                    accessibilityRole="button"
                    accessibilityLabel="Increase quantity"
                  >
                    <Ionicons name="add" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.menuFabCircle}
                  onPress={() => handleAddToCart(product)}
                  activeOpacity={0.88}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${product.name}`}
                >
                  <Ionicons name="add" size={24} color={colors.foreground} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.menuTileBody}>
            <Text style={styles.menuTilePrice}>
              {formatPrice(product.priceCents, currencyU)}
            </Text>
            <Text style={styles.menuTileTitle} numberOfLines={3}>
              {product.name}
            </Text>
            {product.description ? (
              <Text style={styles.menuTileDesc} numberOfLines={2}>
                {product.description}
              </Text>
            ) : null}
            <View style={styles.menuTileFlexSpacer} />
            {primaryTag ? (
              <View style={styles.menuTileFooter}>
                <Ionicons
                  name={dietaryFooterIcon(primaryTag)}
                  size={15}
                  color={footerColor}
                />
                <Text style={[styles.menuTileDesc, { color: footerColor, flex: 1 }]} numberOfLines={1}>
                  {dietaryTagLabel(primaryTag)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [
      cartLineForProduct,
      colors.foreground,
      colors.mutedForeground,
      colors.primary,
      colors.primaryForeground,
      currencyU,
      handleAddToCart,
      productNeedsPicker,
      sumQtyForProduct,
      styles,
      updateQuantity,
    ]
  );

  return (
    <>
      <MenuProductPickerModal
        visible={pickerProduct != null}
        product={pickerProduct}
        currency={currencyU}
        onClose={() => setPickerProduct(null)}
        onAdd={handlePickerAdd}
      />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.screen}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <SectionList<Product[], MenuSection>
            sections={sections}
            keyExtractor={(item) => item.map((p) => p.id).join("-")}
            contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            ListHeaderComponent={
              shop ? (
                <>
                  <View style={styles.heroWrap}>
                    {shop.bannerUrl ? (
                      <Image
                        source={{ uri: shop.bannerUrl }}
                        style={styles.heroImage}
                        resizeMode="cover"
                        accessible={false}
                        importantForAccessibility="no"
                      />
                    ) : (
                      <LinearGradient
                        colors={
                          isDark
                            ? ["#27272A", "#18181B", colors.background]
                            : ["#E4E4E7", "#F4F4F5", colors.background]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroPlaceholder}
                      />
                    )}
                    <LinearGradient
                      colors={["transparent", "transparent", gradientBottom]}
                      locations={[0, 0.45, 1]}
                      style={styles.heroGradient}
                    />
                    <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.iconCircle,
                          pressed && { opacity: 0.85 },
                        ]}
                        onPress={() => router.back()}
                        accessibilityRole="button"
                        accessibilityLabel={t("restaurant.backA11y")}
                      >
                        <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
                      </Pressable>
                    </View>
                    <View style={styles.logoWrap}>
                      {shop.logoUrl ? (
                        <Image source={{ uri: shop.logoUrl }} style={styles.logo} resizeMode="cover" />
                      ) : (
                        <View style={styles.logoPlaceholder}>
                          <Ionicons name="restaurant" size={36} color={colors.mutedForeground} />
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.infoSheet}>
                    <Text style={styles.shopName} numberOfLines={2}>
                      {shop.name}
                    </Text>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.statusPill,
                          shop.isOpen ? styles.statusPillOpen : styles.statusPillClosed,
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            shop.isOpen ? styles.statusDotOpen : styles.statusDotClosed,
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusLabel,
                            shop.isOpen ? styles.statusLabelOpen : styles.statusLabelClosed,
                          ]}
                        >
                          {shop.isOpen ? t("restaurant.openNow") : t("restaurant.closed")}
                        </Text>
                      </View>
                      {shop.address ? (
                        <View style={styles.addressRow}>
                          <Ionicons name="location-outline" size={16} color={colors.mutedForeground} />
                          <Text style={styles.addressText} numberOfLines={2}>
                            {shop.address}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {typeof shop.minimumOrderCents === "number" && shop.minimumOrderCents > 0 ? (
                      <View style={styles.minOrderPill}>
                        <Ionicons name="wallet-outline" size={16} color={colors.foreground} />
                        <Text style={styles.minOrderText}>
                          {t("restaurant.minOrder", {
                            amount: formatPrice(shop.minimumOrderCents, currencyU),
                          })}
                        </Text>
                      </View>
                    ) : null}
                    {shop.description ? (
                      <Text style={styles.description}>{shop.description}</Text>
                    ) : null}
                  </View>
                </>
              ) : null
            }
            ListEmptyComponent={
              <View style={[styles.center, { paddingTop: spacing.xxl }]}>
                <View
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 22,
                    backgroundColor: colors.muted,
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: spacing.md,
                  }}
                >
                  <Ionicons name="fast-food-outline" size={36} color={colors.mutedForeground} />
                </View>
                <Text style={styles.emptyText}>{t("restaurant.noProducts")}</Text>
                <Text style={styles.emptyHint}>{t("restaurant.noProductsHint")}</Text>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionBlock}>
                {section.sectionIndex === 0 ? (
                  <Text style={styles.sectionKicker}>{t("restaurant.menuKicker")}</Text>
                ) : null}
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
            )}
            renderItem={({ item: pair }) => (
              <View style={styles.menuGridRow}>
                {pair.map((p) => (
                  <View key={p.id} style={styles.menuTileCol}>
                    {renderMenuTile(p)}
                  </View>
                ))}
                {pair.length === 1 ? <View style={styles.menuTileCol} /> : null}
              </View>
            )}
          />
        )}

        {shopItemCount > 0 ? (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: spacing.lg,
              paddingBottom: insets.bottom + 10,
              pointerEvents: "box-none",
            }}
          >
            <Pressable
              style={({ pressed }) => [styles.floatingCartBar, pressed && { opacity: 0.96 }]}
              onPress={openCart}
              accessibilityRole="button"
              accessibilityLabel={t("restaurant.viewCartA11y")}
            >
              <View style={styles.floatingCartTextCol}>
                <Text style={styles.floatingCartTitle} numberOfLines={1}>
                  {cartCountLabel}
                </Text>
                <Text style={styles.floatingCartSub} numberOfLines={1}>
                  {formatPrice(shopSubtotalCents, currencyU)}
                </Text>
              </View>
              <View style={styles.floatingCartCta}>
                <Text style={styles.floatingCartCtaText}>{t("restaurant.viewCart")}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primaryForeground} />
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );
}

import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { useFavorites } from "@/hooks/use-favorites";
import { useCurrencyStore, formatPrice } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { screenChromeStyles, elevatedCardShadow } from "@/lib/screen-layout";
import { MobileEmptyState } from "@/components/mobile-empty-state";
import type { FavoriteShop, FavoriteProduct } from "@dilivygo/types";

const FAV_CARD_H = 100;
const FAV_THUMB = 100;

function createFavoritesStyles(c: AppColors) {
  return StyleSheet.create({
    ...screenChromeStyles(c),
    card: {
      flexDirection: "row",
      alignItems: "stretch",
      height: FAV_CARD_H,
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      overflow: "hidden",
      ...elevatedCardShadow(),
    },
    cardThumb: {
      width: FAV_THUMB,
      height: FAV_CARD_H,
    },
    cardThumbPlaceholder: {
      width: FAV_THUMB,
      height: FAV_CARD_H,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.muted,
    },
    cardBody: {
      flex: 1,
      minWidth: 0,
      paddingVertical: spacing.md,
      paddingRight: spacing.md,
      paddingLeft: spacing.md,
      justifyContent: "center",
    },
    cardTitle: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: c.foreground,
      letterSpacing: -0.2,
    },
    cardDescription: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      marginTop: 4,
      lineHeight: 18,
      minHeight: 36,
      maxHeight: 36,
    },
    productShop: {
      fontFamily: fonts.medium,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
      marginTop: 4,
      minHeight: 16,
      maxHeight: 16,
    },
    productPrice: {
      fontFamily: fonts.bold,
      fontSize: fontSize.sm,
      color: c.foreground,
      marginTop: 6,
    },
    chevronWrap: {
      justifyContent: "center",
      paddingRight: spacing.sm,
      opacity: 0.35,
    },
  });
}

export default function FavoritesScreen() {
  const router = useRouter();
  const { t } = useTranslation("mobile");
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createFavoritesStyles);
  const insets = useSafeAreaInsets();
  const { data, isLoading } = useFavorites();
  const currencyCode = useCurrencyStore((s) => s.code);

  const favoriteShops = (data?.favoriteShops as FavoriteShop[] | undefined) ?? [];
  const favoriteProducts = (data?.favoriteProducts as FavoriteProduct[] | undefined) ?? [];
  const hasAny = favoriteShops.length > 0 || favoriteProducts.length > 0;

  const listData = [
    ...favoriteShops.map((s) => ({ type: "shop" as const, item: s })),
    ...favoriteProducts.map((p) => ({ type: "product" as const, item: p })),
  ];

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>{t("screens.favorites.eyebrow")}</Text>
        <Text style={styles.headerTitle}>{t("screens.favorites.title")}</Text>
      </View>

      {isLoading ? (
        <MobileEmptyState
          icon="heart-outline"
          title={t("screens.favorites.loading")}
          loading
        />
      ) : !hasAny ? (
        <MobileEmptyState
          icon="heart-outline"
          title={t("screens.favorites.emptyTitle")}
          subtitle={t("screens.favorites.emptySubtitle")}
        />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(row) => `${row.type}-${row.item.id}`}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: row }) => {
            if (row.type === "shop") {
              const shop = row.item as FavoriteShop;
              return (
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.88}
                  onPress={() =>
                    router.push(`/restaurant/${shop.shop.projectRef}?shopId=${shop.shopId}` as any)
                  }
                >
                  {shop.shop.bannerUrl ? (
                    <Image source={{ uri: shop.shop.bannerUrl }} style={styles.cardThumb} />
                  ) : (
                    <View style={styles.cardThumbPlaceholder}>
                      <Ionicons name="restaurant-outline" size={32} color={colors.mutedForeground} />
                    </View>
                  )}
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {shop.shop.name}
                    </Text>
                    <Text style={styles.cardDescription} numberOfLines={2}>
                      {shop.shop.description?.trim()
                        ? shop.shop.description
                        : " "}
                    </Text>
                  </View>
                  <View style={styles.chevronWrap}>
                    <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                  </View>
                </TouchableOpacity>
              );
            }

            const product = row.item as FavoriteProduct;
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.88}
                onPress={() =>
                  router.push(
                    `/restaurant/${product.product.projectRef}?shopId=${product.shopId ?? ""}` as any
                  )
                }
              >
                {product.product.imageUrl ? (
                  <Image source={{ uri: product.product.imageUrl }} style={styles.cardThumb} />
                ) : (
                  <View style={styles.cardThumbPlaceholder}>
                    <Ionicons name="fast-food-outline" size={28} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {product.product.name}
                  </Text>
                  <Text style={styles.productShop} numberOfLines={1}>
                    {product.product.shopId ? String(product.product.shopId) : " "}
                  </Text>
                  <Text style={styles.productPrice}>
                    {formatPrice(product.product.priceCents, currencyCode)}
                  </Text>
                </View>
                <View style={styles.chevronWrap}>
                  <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

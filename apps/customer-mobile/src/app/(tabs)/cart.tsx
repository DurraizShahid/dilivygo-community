import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SvgXml } from "react-native-svg";
import { useTranslation } from "@dilivygo/i18n";
import { EMPTY_CART_SVG_XML } from "@/assets/emptycart-xml";
import { useCartStore } from "@/stores/cart-store";
import { formatPrice, useCurrencyStore, computeDeliveryFee } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { screenChromeStyles, elevatedCardShadow } from "@/lib/screen-layout";

function createCartStyles(c: AppColors) {
  return StyleSheet.create({
    ...screenChromeStyles(c),
    itemCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      marginBottom: spacing.md,
      ...elevatedCardShadow(),
    },
    itemInfo: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: spacing.md,
      gap: spacing.md,
    },
    shopHeading: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
      color: c.primary,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
      marginBottom: spacing.sm,
    },
    itemName: {
      flex: 1,
      minWidth: 0,
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: c.foreground,
      letterSpacing: -0.2,
    },
    itemPrice: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: c.foreground,
    },
    itemActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    quantityRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    qtyButton: {
      width: 40,
      height: 40,
      borderRadius: borderRadius.full,
      backgroundColor: c.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}18`,
      justifyContent: "center",
      alignItems: "center",
    },
    modifierLine: {
      marginTop: 4,
      fontSize: fontSize.xs,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      lineHeight: 16,
    },
    qtyText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: c.foreground,
      minWidth: 24,
      textAlign: "center",
    },
    footer: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      backgroundColor: c.background,
    },
    footerCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      marginBottom: spacing.md,
      ...elevatedCardShadow(2),
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.sm,
    },
    summaryLabel: {
      fontFamily: fonts.medium,
      fontSize: fontSize.sm,
      color: c.mutedForeground,
    },
    summaryValue: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: c.foreground,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: spacing.md,
    },
    totalLabel: {
      fontFamily: fonts.bold,
      fontSize: fontSize.lg,
      color: c.foreground,
    },
    totalValue: {
      fontFamily: fonts.extrabold,
      fontSize: fontSize.lg,
      color: c.foreground,
      letterSpacing: -0.3,
    },
    checkoutButton: {
      height: 54,
      borderRadius: borderRadius.xl,
      backgroundColor: c.primary,
      justifyContent: "center",
      alignItems: "center",
      ...elevatedCardShadow(2),
    },
    checkoutText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: c.primaryForeground,
    },
    emptyIllustration: {
      marginBottom: spacing.sm,
    },
  });
}

const EMPTY_CART_VIEWBOX = { w: 224, h: 346 };

export default function CartScreen() {
  const router = useRouter();
  const { t } = useTranslation("mobile");
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createCartStyles);
  const insets = useSafeAreaInsets();
  const emptySvgWidth = Math.min(168, windowWidth - spacing.xl * 2);
  const emptySvgHeight = Math.round(
    emptySvgWidth * (EMPTY_CART_VIEWBOX.h / EMPTY_CART_VIEWBOX.w)
  );
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const totalCents = useCartStore((s) => s.totalCents());
  const cartCurrency = useCartStore((s) => s.currency) ?? undefined;
  const deliveryFeeConfig = useCurrencyStore((s) => s.deliveryFeeConfig);
  const multiShopCartEnabled = useCurrencyStore((s) => s.multiShopCartEnabled);
  const deliveryFee = computeDeliveryFee(deliveryFeeConfig, totalCents);

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>{t("screens.cart.eyebrow")}</Text>
          <Text style={styles.headerTitle}>{t("screens.cart.title")}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ alignItems: "center", paddingHorizontal: spacing.xl }}>
            <View
              style={styles.emptyIllustration}
              accessible
              accessibilityRole="image"
              accessibilityLabel="Empty cart"
            >
              <SvgXml xml={EMPTY_CART_SVG_XML} width={emptySvgWidth} height={emptySvgHeight} />
            </View>
            <Text
              style={{
                fontFamily: fonts.bold,
                fontSize: fontSize.xl,
                color: colors.foreground,
                textAlign: "center",
                marginTop: spacing.md,
              }}
            >
              {t("screens.cart.emptyTitle")}
            </Text>
            <Text
              style={{
                fontFamily: fonts.regular,
                fontSize: fontSize.sm,
                color: colors.mutedForeground,
                textAlign: "center",
                marginTop: spacing.sm,
                lineHeight: 21,
                maxWidth: 300,
              }}
            >
              {t("screens.cart.emptySubtitle")}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>{t("screens.cart.eyebrow")}</Text>
        <Text style={styles.headerTitle}>{t("screens.cart.title")}</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContentFlat,
          { paddingBottom: 0 },
        ]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <View>
            {multiShopCartEnabled &&
            item.shopName &&
            (index === 0 || items[index - 1]?.shopName !== item.shopName) ? (
              <Text style={styles.shopHeading}>{item.shopName}</Text>
            ) : null}
            <View style={styles.itemCard}>
            <View style={styles.itemInfo}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.selectedModifiers?.length
                  ? item.selectedModifiers.map((m, idx) => (
                      <Text
                        key={`${m.groupName}-${m.optionName}-${idx}`}
                        style={styles.modifierLine}
                        numberOfLines={2}
                      >
                        {m.groupName}: {m.optionName}
                      </Text>
                    ))
                  : null}
              </View>
              <Text style={styles.itemPrice}>
                {formatPrice(item.unitPriceCents * item.quantity, cartCurrency)}
              </Text>
            </View>
            <View style={styles.itemActions}>
              <View style={styles.quantityRow}>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => updateQuantity(item.id, item.quantity - 1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="remove" size={20} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyButton}
                  onPress={() => updateQuantity(item.id, item.quantity + 1)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={20} color={colors.foreground} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.footerCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t("screens.cart.subtotal")}</Text>
            <Text style={styles.summaryValue}>{formatPrice(totalCents, cartCurrency)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{t("screens.cart.deliveryFee")}</Text>
            <Text style={styles.summaryValue}>{formatPrice(deliveryFee, cartCurrency)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>{t("screens.cart.total")}</Text>
            <Text style={styles.totalValue}>
              {formatPrice(totalCents + deliveryFee, cartCurrency)}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.checkoutButton}
          activeOpacity={0.88}
          onPress={() => router.push("/checkout")}
        >
          <Text style={styles.checkoutText}>{t("screens.cart.checkout")}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

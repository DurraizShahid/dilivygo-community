import { View, Text, Image, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DIETARY_TAG_OPTIONS, type Product } from "@dilivygo/types";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";

const DIETARY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  vegan: "leaf-outline",
  halal: "sparkles-outline",
  gluten_free: "nutrition-outline",
  nut_free: "close-circle-outline",
};

const DIETARY_COLOR: Record<string, string> = {
  vegan: "#16a34a",
  halal: "#d97706",
  gluten_free: "#b45309",
  nut_free: "#ea580c",
};

function dietaryLabel(tag: string) {
  return DIETARY_TAG_OPTIONS.find((o) => o.value === tag)?.label ?? tag.replace(/_/g, " ");
}

type Props = {
  product: Product;
  formattedPrice: string;
  quantity: number;
  colors: AppColors;
  isDark: boolean;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
};

export function MenuProductTile({
  product,
  formattedPrice,
  quantity,
  colors,
  isDark,
  onAdd,
  onIncrement,
  onDecrement,
}: Props) {
  const primaryTag = product.dietaryTags?.[0];
  const badgeTags = product.dietaryTags?.slice(0, 2) ?? [];
  const footerIcon = primaryTag
    ? DIETARY_ICON[primaryTag] ?? "pricetag-outline"
    : null;
  const footerColor = primaryTag
    ? DIETARY_COLOR[primaryTag] ?? colors.mutedForeground
    : colors.mutedForeground;

  const fabBg = isDark ? colors.card : "#FFFFFF";
  const fabBorder = isDark ? `${colors.foreground}22` : "rgba(0,0,0,0.08)";
  const fabText = isDark ? colors.foreground : "#111111";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: `${colors.foreground}12`,
        },
      ]}
    >
      <View style={styles.imageBlock}>
        <View
          style={[
            styles.imageWell,
            { backgroundColor: isDark ? `${colors.muted}99` : `${colors.muted}80` },
          ]}
        >
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.placeholderInner}>
              <Ionicons name="image-outline" size={32} color={colors.mutedForeground} />
            </View>
          )}

          {badgeTags.length > 0 ? (
            <View style={styles.badgeCluster}>
              {badgeTags.map((tag) => (
                <View
                  key={tag}
                  style={[
                    styles.badge,
                    {
                      backgroundColor: isDark ? "rgba(9,9,11,0.88)" : "rgba(255,255,255,0.94)",
                    },
                  ]}
                >
                  <Text
                    style={[styles.badgeText, { color: colors.foreground }]}
                    numberOfLines={1}
                  >
                    {dietaryLabel(tag)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.fabSlot}>
          {quantity > 0 ? (
            <View
              style={[
                styles.qtyPill,
                {
                  backgroundColor: fabBg,
                  borderColor: fabBorder,
                  ...Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.12,
                      shadowRadius: 8,
                    },
                    android: { elevation: 6 },
                    default: {},
                  }),
                },
              ]}
            >
              <TouchableOpacity
                onPress={onDecrement}
                style={styles.qtyBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Decrease quantity"
              >
                <Ionicons name="remove" size={20} color={fabText} />
              </TouchableOpacity>
              <Text style={[styles.qtyNum, { color: fabText }]}>{quantity}</Text>
              <TouchableOpacity
                onPress={onIncrement}
                style={styles.qtyBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Increase quantity"
              >
                <Ionicons name="add" size={20} color={fabText} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={onAdd}
              style={[
                styles.fab,
                {
                  backgroundColor: fabBg,
                  borderColor: fabBorder,
                  ...Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.14,
                      shadowRadius: 8,
                    },
                    android: { elevation: 6 },
                    default: {},
                  }),
                },
              ]}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.name}`}
            >
              <Ionicons name="add" size={26} color={fabText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.body}>
        <Text style={[styles.price, { color: colors.foreground }]}>{formattedPrice}</Text>
        <Text style={[styles.title, { color: colors.foreground }]} numberOfLines={3}>
          {product.name}
        </Text>
        {product.description ? (
          <Text
            style={[styles.desc, { color: colors.mutedForeground }]}
            numberOfLines={2}
          >
            {product.description}
          </Text>
        ) : null}

        {primaryTag && footerIcon ? (
          <View style={styles.footerRow}>
            <Ionicons name={footerIcon} size={15} color={footerColor} />
            <Text style={[styles.footerText, { color: footerColor }]}>
              {dietaryLabel(primaryTag)}
            </Text>
          </View>
        ) : (
          <View style={styles.footerSpacer} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    borderRadius: borderRadius.xl + 4,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  imageBlock: {
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm + 2,
  },
  imageWell: {
    height: 132,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    padding: spacing.sm,
  },
  placeholderInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeCluster: {
    position: "absolute",
    left: spacing.sm,
    bottom: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    maxWidth: "72%",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: fonts.semibold,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  fabSlot: {
    alignItems: "flex-end",
    paddingRight: 2,
    marginTop: -22,
    zIndex: 4,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyPill: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    height: 44,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyNum: {
    minWidth: 22,
    textAlign: "center",
    fontSize: fontSize.sm,
    fontFamily: fonts.bold,
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: spacing.sm + 2,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  price: {
    fontSize: fontSize.lg,
    fontFamily: fonts.extrabold,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  title: {
    marginTop: 4,
    fontSize: fontSize.sm,
    fontFamily: fonts.semibold,
    fontWeight: "600",
    lineHeight: 19,
  },
  desc: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: fonts.regular,
    lineHeight: 15,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: "auto",
    paddingTop: spacing.sm,
  },
  footerText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    fontWeight: "500",
    flex: 1,
  },
  footerSpacer: {
    minHeight: 4,
    marginTop: spacing.xs,
  },
});

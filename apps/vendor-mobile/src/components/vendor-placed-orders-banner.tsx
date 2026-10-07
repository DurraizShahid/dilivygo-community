import { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useSegments } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@dilivygo/i18n";
import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@dilivygo/types";
import { useAppTheme } from "@/providers/theme-provider";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import { api } from "@/lib/api";
import { useShopStore } from "@/stores/shop-store";
import { useVendorRealtimeStore } from "@/stores/vendor-realtime-store";

const TAB_BAR_REGION = 56;

export function VendorPlacedOrdersBanner() {
  const { t } = useTranslation("mobile");
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const activeShop = useShopStore((s) => s.activeShop);
  const placedBannerDismissed = useVendorRealtimeStore((s) => s.placedBannerDismissed);
  const setPlacedBannerDismissed = useVendorRealtimeStore((s) => s.setPlacedBannerDismissed);

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["vendor-orders", activeShop?.id],
    queryFn: () => api.orders.list({ limit: 50, shopId: activeShop?.id }) as Promise<Order[]>,
    enabled: !!activeShop?.id,
    staleTime: 15_000,
  });

  const placedCount = orders?.filter((o) => o.status === "placed").length ?? 0;

  useEffect(() => {
    if (placedCount === 0) setPlacedBannerDismissed(false);
  }, [placedCount, setPlacedBannerDismissed]);

  const segs = segments as string[];
  const onOrdersTab = segs[0] === "(tabs)" && segs[1] === "index";

  if (placedCount === 0 || onOrdersTab || placedBannerDismissed) return null;

  return (
    <View
      style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_REGION + spacing.sm }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[styles.bar, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        onPress={() => router.push("/(tabs)")}
        accessibilityRole="button"
        accessibilityHint={t("banner.viewOrdersHint")}
      >
        <Ionicons name="flash" size={20} color={colors.primaryForeground} />
        <Text style={[styles.text, { color: colors.primaryForeground }]} numberOfLines={2}>
          {t("banner.newOrders", { count: placedCount })}
        </Text>
        <Text style={[styles.cta, { color: colors.primaryForeground }]}>{t("banner.viewOrders")}</Text>
      </Pressable>
      <Pressable
        style={[styles.dismiss, { borderColor: colors.border, backgroundColor: colors.card }]}
        onPress={() => setPlacedBannerDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel={t("banner.dismiss")}
      >
        <Ionicons name="close" size={18} color={colors.mutedForeground} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  bar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  text: { flex: 1, fontSize: fontSize.sm, fontWeight: "600", lineHeight: 20 },
  cta: { fontSize: fontSize.xs, fontWeight: "800", textTransform: "uppercase" },
  dismiss: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

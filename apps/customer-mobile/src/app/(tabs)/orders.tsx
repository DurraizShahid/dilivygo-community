import { useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";
import { useThemedStyles } from "@/hooks/use-themed-styles";
import { screenChromeStyles, elevatedCardShadow } from "@/lib/screen-layout";
import { MobileEmptyState } from "@/components/mobile-empty-state";
import type { Order, OrderStatus } from "@dilivygo/types";
import { useCartStore } from "@/stores/cart-store";
import { addOrderItemsToCart } from "@/lib/order-utils";

function buildStatusConfig(
  c: AppColors
): Record<OrderStatus, { label: string; color: string }> {
  return {
    placed: { label: "Placed", color: c.mutedForeground },
    accepted: { label: "Accepted", color: "#3B82F6" },
    rejected: { label: "Rejected", color: c.destructive },
    preparing: { label: "Preparing", color: "#F97316" },
    ready: { label: "Ready", color: "#F97316" },
    assigned: { label: "Assigned", color: "#3B82F6" },
    picked_up: { label: "Picked up", color: "#3B82F6" },
    arrived: { label: "Arrived", color: c.success },
    completed: { label: "Completed", color: c.success },
    cancelled: { label: "Cancelled", color: c.destructive },
    scheduled: { label: "Scheduled", color: c.mutedForeground },
  };
}

function createOrdersStyles(c: AppColors) {
  return StyleSheet.create({
    ...screenChromeStyles(c),
    card: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      padding: spacing.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      borderLeftWidth: 3,
      marginBottom: spacing.md,
      ...elevatedCardShadow(),
    },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.md,
      gap: spacing.sm,
    },
    orderId: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: c.foreground,
      letterSpacing: -0.2,
      flex: 1,
      minWidth: 0,
    },
    badge: {
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: borderRadius.full,
    },
    badgeText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xs,
    },
    cardBottom: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    price: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.base,
      color: c.foreground,
    },
    date: {
      fontFamily: fonts.medium,
      fontSize: fontSize.xs,
      color: c.mutedForeground,
    },
    scheduledText: {
      fontFamily: fonts.semibold,
      fontSize: 11,
      color: c.warning,
      marginTop: spacing.sm,
    },
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    reorderButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 10,
      borderRadius: borderRadius.full,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.primary,
      backgroundColor: `${c.primary}0D`,
    },
    reorderButtonText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: c.primary,
    },
    rateButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: 10,
      borderRadius: borderRadius.full,
      backgroundColor: c.primary,
    },
    rateButtonText: {
      fontFamily: fonts.semibold,
      fontSize: fontSize.sm,
      color: c.primaryForeground,
    },
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrdersScreen() {
  const router = useRouter();
  const { t } = useTranslation("mobile");
  const cart = useCartStore();
  const { colors } = useAppTheme();
  const styles = useThemedStyles(createOrdersStyles);
  const statusConfig = useMemo(() => buildStatusConfig(colors), [colors]);

  const {
    data: orders,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<Order[]>({
    queryKey: ["orders"],
    queryFn: () => api.orders.list({ limit: 50 }),
  });

  async function handleReorder(orderId: string) {
    try {
      const response = await api.orders.get(orderId);
      const raw = (response as { order?: unknown })?.order ?? response;
      const order = raw as Order;
      if (!order || !order.items?.length) {
        Alert.alert("Cannot reorder", "This order has no items to reorder.");
        return;
      }
      if (
        (cart.shopId && order.shopId && cart.shopId !== order.shopId) ||
        (cart.projectRef && cart.projectRef !== order.projectRef)
      ) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            "Different shop",
            "Your cart has items from another shop. Clear cart and add these items?",
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
              {
                text: "Clear & add",
                style: "destructive",
                onPress: () => {
                  cart.clear();
                  resolve(true);
                },
              },
            ]
          );
        });
        if (!proceed) return;
      }
      const added = addOrderItemsToCart(order);
      if (!added) {
        Alert.alert("Nothing added", "No valid items were found to reorder.");
        return;
      }
      router.push("/(tabs)/cart");
    } catch (err: unknown) {
      const msg = err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message)
        : "Failed to reorder";
      Alert.alert("Error", msg);
    }
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>{t("screens.orders.eyebrow")}</Text>
          <Text style={styles.headerTitle}>{t("screens.orders.title")}</Text>
        </View>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerEyebrow}>{t("screens.orders.eyebrow")}</Text>
        <Text style={styles.headerTitle}>{t("screens.orders.title")}</Text>
      </View>

      {!orders?.length ? (
        <MobileEmptyState
          icon="receipt-outline"
          title={t("screens.orders.empty")}
        />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContentFlat}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          renderItem={({ item }) => {
            const config = statusConfig[item.status];
            const scheduledWhen =
              item.status === "scheduled" && item.scheduledFor
                ? new Date(item.scheduledFor).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "";
            return (
              <View style={[styles.card, { borderLeftColor: config.color }]}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => router.push(`/order/${item.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${config.label}, ${formatPrice(item.totalCents)}`}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.orderId} numberOfLines={1}>
                      #{item.id.slice(-8).toUpperCase()}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                      <View style={[styles.badge, { backgroundColor: `${config.color}22` }]}>
                        <Text style={[styles.badgeText, { color: config.color }]}>
                          {config.label}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
                    </View>
                  </View>
                  <View style={styles.cardBottom}>
                    <Text style={styles.price}>{formatPrice(item.totalCents)}</Text>
                    <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                  </View>
                  {scheduledWhen ? (
                    <Text style={styles.scheduledText}>
                      {t("screens.orders.scheduledFor", { when: scheduledWhen })}
                    </Text>
                  ) : null}
                </TouchableOpacity>
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.reorderButton}
                    activeOpacity={0.85}
                    onPress={() => void handleReorder(item.id)}
                  >
                    <Text style={styles.reorderButtonText}>{t("screens.orders.reorder")}</Text>
                  </TouchableOpacity>
                  {item.status === "completed" ? (
                    <TouchableOpacity
                      style={styles.rateButton}
                      activeOpacity={0.85}
                      onPress={() => router.push(`/rate/${item.id}`)}
                    >
                      <Text style={styles.rateButtonText}>{t("screens.orders.rate")}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

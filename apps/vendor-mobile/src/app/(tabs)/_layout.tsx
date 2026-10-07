import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@dilivygo/i18n";
import { api } from "@/lib/api";
import { useAppTheme } from "@/providers/theme-provider";
import { useShopStore } from "@/stores/shop-store";
import type { Order, Shop } from "@dilivygo/types";

export default function TabLayout() {
  const { t } = useTranslation("mobile");
  const { colors } = useAppTheme();
  const { setShops, setActiveShop, activeShop } = useShopStore();

  const { data } = useQuery<{ shops: Shop[] }>({
    queryKey: ["shops"],
    queryFn: () => api.shops.list(),
  });

  const { data: orders } = useQuery<Order[]>({
    queryKey: ["vendor-orders", activeShop?.id],
    queryFn: () => api.orders.list({ limit: 50, shopId: activeShop?.id }) as Promise<Order[]>,
    enabled: !!activeShop?.id,
    staleTime: 15_000,
  });

  const placedBadge =
    orders?.filter((o) => o.status === "placed").length ?? 0;

  useEffect(() => {
    if (data?.shops) {
      setShops(data.shops);
      if (!activeShop && data.shops.length > 0) {
        setActiveShop(data.shops[0]);
      }
    }
  }, [data, activeShop, setShops, setActiveShop]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.orders"),
          tabBarBadge: placedBadge > 0 ? (placedBadge > 99 ? "99+" : placedBadge) : undefined,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: t("tabs.menu"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: t("tabs.chat"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.settings"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

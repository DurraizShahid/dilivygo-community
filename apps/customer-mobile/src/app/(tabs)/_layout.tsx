import { useMemo } from "react";
import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "@dilivygo/i18n";
import { useAppTheme } from "@/providers/theme-provider";
import { useCartStore } from "@/stores/cart-store";
import { fonts } from "@/lib/theme";

export default function TabLayout() {
  const { t } = useTranslation("mobile");
  const { colors } = useAppTheme();
  const itemCount = useCartStore((s) => s.itemCount());

  /** Matches home header `cartHeaderBadgeChrome` / `cartHeaderBadgeTextChrome` */
  const cartTabBarBadgeStyle = useMemo(
    () => ({
      backgroundColor: colors.primary,
      color: colors.primaryForeground,
      borderWidth: 2,
      borderColor: colors.border,
      fontSize: 10,
      fontFamily: fonts.bold,
      lineHeight: 16,
      height: 18,
      minWidth: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      overflow: "hidden" as const,
    }),
    [colors.primary, colors.primaryForeground, colors.border]
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          ...Platform.select({
            ios: {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
            },
            android: { elevation: 8 },
            default: {},
          }),
        },
        tabBarLabelStyle: {
          fontFamily: fonts.semibold,
          fontSize: 11,
          letterSpacing: 0.2,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.home"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          href: null,
          title: t("tabs.favorites"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="heart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t("tabs.cart"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
          tabBarBadge:
            itemCount > 0 ? (itemCount > 99 ? "99+" : itemCount) : undefined,
          tabBarBadgeStyle: cartTabBarBadgeStyle,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t("tabs.orders"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
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
        name="account"
        options={{
          title: t("tabs.account"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

import { useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@dilivygo/i18n";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/providers/theme-provider";
import { spacing, fontSize, borderRadius } from "@/lib/theme";
import { useVendorRealtimeStore } from "@/stores/vendor-realtime-store";

export function VendorStatusBanner() {
  const { t } = useTranslation("mobile");
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const statusBanner = useVendorRealtimeStore((s) => s.statusBanner);
  const setStatusBanner = useVendorRealtimeStore((s) => s.setStatusBanner);

  useEffect(() => {
    if (!statusBanner) return;
    const timer = setTimeout(() => setStatusBanner(null), 5500);
    return () => clearTimeout(timer);
  }, [statusBanner, setStatusBanner]);

  if (!statusBanner) return null;

  return (
    <View
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.card,
            borderColor: colors.primary,
            shadowColor: colors.foreground,
          },
        ]}
      >
        <Ionicons name="notifications" size={20} color={colors.primary} style={styles.icon} />
        <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={3}>
          {statusBanner.message}
        </Text>
        <Pressable
          onPress={() => setStatusBanner(null)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("banner.dismiss")}
        >
          <Ionicons name="close" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    zIndex: 50,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    elevation: 6,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  icon: { marginRight: spacing.xs },
  text: { flex: 1, fontSize: fontSize.sm, fontWeight: "500", lineHeight: 20 },
});

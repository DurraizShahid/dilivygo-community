import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/providers/theme-provider";
import { spacing, fontSize, fonts } from "@/lib/theme";
import type { AppColors } from "@/lib/theme";

type IoniconsName = keyof typeof Ionicons.glyphMap;

function createEmptyStyles(c: AppColors, isDark: boolean) {
  const ringBg = isDark ? `${c.muted}` : `${c.muted}`;
  return StyleSheet.create({
    wrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
      gap: spacing.md,
    },
    iconRing: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: ringBg,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    title: {
      fontFamily: fonts.bold,
      fontSize: fontSize.xl,
      color: c.foreground,
      textAlign: "center",
      letterSpacing: -0.3,
    },
    subtitle: {
      fontFamily: fonts.regular,
      fontSize: fontSize.sm,
      color: c.mutedForeground,
      textAlign: "center",
      lineHeight: 21,
      maxWidth: 300,
    },
  });
}

type Props = {
  icon: IoniconsName;
  iconSize?: number;
  title: string;
  subtitle?: string;
  loading?: boolean;
};

export function MobileEmptyState({
  icon,
  iconSize = 44,
  title,
  subtitle,
  loading,
}: Props) {
  const { colors, isDark } = useAppTheme();
  const s = createEmptyStyles(colors, isDark);

  return (
    <View style={s.wrap}>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <View style={s.iconRing}>
          <Ionicons
            name={icon}
            size={iconSize}
            color={colors.mutedForeground}
          />
        </View>
      )}
      <Text style={s.title}>{title}</Text>
      {subtitle && !loading ? (
        <Text style={s.subtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

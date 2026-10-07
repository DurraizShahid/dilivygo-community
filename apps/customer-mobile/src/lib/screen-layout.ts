import { Platform, StyleSheet } from "react-native";
import type { AppColors } from "@/lib/theme";
import { spacing, fontSize, borderRadius, fonts } from "@/lib/theme";

/** Horizontal inset for primary screens — matches home `H_PAD`. */
export const SCREEN_H_PAD = spacing.lg;

export function elevatedCardShadow(elevation = 3) {
  return Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.07,
      shadowRadius: 14,
    },
    android: { elevation },
    default: {},
  });
}

/** Plain style objects — compose with `StyleSheet.create({ ...screenChromeStyles(c), ... })`. */
export function screenChromeStyles(c: AppColors) {
  return {
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    headerEyebrow: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.mutedForeground,
      textTransform: "uppercase" as const,
      letterSpacing: 1.4,
      marginBottom: 4,
    },
    headerTitle: {
      fontSize: fontSize["3xl"],
      fontFamily: fonts.extrabold,
      color: c.foreground,
      letterSpacing: -0.6,
      lineHeight: 34,
    },
    headerSubtitle: {
      fontSize: fontSize.sm,
      fontFamily: fonts.regular,
      color: c.mutedForeground,
      marginTop: spacing.xs,
      lineHeight: 20,
    },
    headerRow: {
      flexDirection: "row" as const,
      alignItems: "flex-end" as const,
      justifyContent: "space-between" as const,
      gap: spacing.md,
    },
    listContent: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl + spacing.lg,
      gap: spacing.md,
    },
    listContentFlat: {
      paddingHorizontal: SCREEN_H_PAD,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xxl + spacing.lg,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: fonts.bold,
      color: c.foreground,
      textTransform: "uppercase" as const,
      letterSpacing: 1.4,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    elevatedCard: {
      backgroundColor: c.card,
      borderRadius: borderRadius.xl + 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: `${c.foreground}0D`,
      overflow: "hidden" as const,
      ...elevatedCardShadow(),
    },
    primaryButton: {
      height: 54,
      borderRadius: borderRadius.xl,
      backgroundColor: c.primary,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      ...elevatedCardShadow(2),
    },
    primaryButtonText: {
      fontFamily: fonts.bold,
      fontSize: fontSize.base,
      color: c.primaryForeground,
    },
    searchPill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      backgroundColor: c.muted,
      borderRadius: borderRadius.full,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      minHeight: 48,
      gap: spacing.sm,
      ...Platform.select({
        ios: {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.06,
          shadowRadius: 10,
        },
        android: { elevation: 2 },
        default: {},
      }),
    },
  };
}

import { useMemo } from "react";
import { StyleSheet } from "react-native";
import type { AppColors } from "@/lib/theme";
import { useAppTheme } from "@/providers/theme-provider";

/**
 * Build StyleSheets from the current theme. Pass a stable factory defined at module scope.
 */
export function useThemedStyles<T extends Record<string, object>>(
  factory: (c: AppColors) => T
): T {
  const { colors } = useAppTheme();
  return useMemo(
    () => StyleSheet.create(factory(colors)) as unknown as T,
    [colors, factory]
  );
}

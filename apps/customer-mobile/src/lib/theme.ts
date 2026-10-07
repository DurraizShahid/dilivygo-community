import Constants from "expo-constants";
import type { ColorSchemeName } from "react-native";
import type { PlatformThemePayload } from "@dilivygo/types";
import { mergePlatformThemeColors } from "@dilivygo/types";

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
};

export type AppColors = typeof lightColors;

export const lightColors = {
  primary: "#111111",
  primaryForeground: "#FAFAFA",
  background: "#FFFFFF",
  foreground: "#0A0A0A",
  card: "#FFFFFF",
  cardForeground: "#0A0A0A",
  muted: "#F4F4F5",
  mutedForeground: "#71717A",
  border: "#E4E4E7",
  destructive: "#EF4444",
  success: "#22C55E",
  warning: "#EAB308",
  accent: "#F4F4F5",
};

export const darkColors: AppColors = {
  primary: "#FAFAFA",
  primaryForeground: "#18181B",
  background: "#09090B",
  foreground: "#FAFAFA",
  card: "#18181B",
  cardForeground: "#FAFAFA",
  muted: "#27272A",
  mutedForeground: "#A1A1AA",
  border: "#3F3F46",
  destructive: "#F87171",
  success: "#4ADE80",
  warning: "#FACC15",
  accent: "#27272A",
};

/** @deprecated Use getColors() instead */
export const colors = lightColors;

export function getColors(
  scheme: ColorSchemeName | "light" | "dark",
  platformTheme?: PlatformThemePayload | null,
): AppColors {
  const bakedPrimary = Constants.expoConfig?.extra?.primaryColor as string | undefined;
  const initialBase = scheme === "dark" ? darkColors : lightColors;
  const base = bakedPrimary && scheme !== "dark" ? { ...initialBase, primary: bakedPrimary } : initialBase;
  const overlay = scheme === "dark" ? platformTheme?.dark : platformTheme?.light;
  return mergePlatformThemeColors(base, overlay);
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const fontSize = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30 };
export const borderRadius = { sm: 6, md: 8, lg: 12, xl: 16, full: 9999 };

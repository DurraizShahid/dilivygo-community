import { createContext, useContext, useEffect, useMemo } from "react";
import { useColorScheme, type ColorSchemeName } from "react-native";
import { useThemeStore, type ThemeMode } from "@/stores/theme-store";
import { useCurrencyStore } from "@/lib/currency";
import { getColors, type AppColors } from "@/lib/theme";

interface ThemeContextValue {
  colors: AppColors;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const { mode, setMode, hydrate } = useThemeStore();
  const platformTheme = useCurrencyStore((s) => s.platformTheme);

  useEffect(() => {
    hydrate();
  }, []);

  const resolvedScheme: ColorSchemeName = useMemo(() => {
    if (mode === "system") return systemScheme ?? "light";
    return mode;
  }, [mode, systemScheme]);

  const colors = useMemo(
    () => getColors(resolvedScheme, platformTheme),
    [resolvedScheme, platformTheme],
  );
  const isDark = resolvedScheme === "dark";

  const value = useMemo(
    () => ({ colors, isDark, mode, setMode }),
    [colors, isDark, mode, setMode]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within AppThemeProvider");
  return ctx;
}

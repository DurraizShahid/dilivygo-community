import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "dilivygo-theme-mode";

interface ThemeState {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  hydrate: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set) => ({
  mode: "system",

  setMode: (mode) => {
    set({ mode });
    SecureStore.setItemAsync(STORAGE_KEY, mode).catch(() => {});
  },

  hydrate: async () => {
    try {
      const stored = await SecureStore.getItemAsync(STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        set({ mode: stored });
      }
    } catch {}
  },
}));

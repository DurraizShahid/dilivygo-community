import { create } from "zustand";
import * as Localization from "expo-localization";
import type { PlatformThemePayload } from "@dilivygo/types";
import { API_BASE_URL } from "./api";
import { defaultPublicThemeRef } from "./workspace-ref";

export interface PlatformLanguageConfig {
  defaultLanguage: string;
  locked: boolean;
}

interface CurrencyState {
  code: string;
  languageConfig: PlatformLanguageConfig | null;
  defaultProfilePhotoUrls: string[];
  platformTheme: PlatformThemePayload | null;
  hydrate: () => Promise<void>;
}

export const useCurrencyStore = create<CurrencyState>((set) => ({
  code: "GBP",
  languageConfig: null,
  defaultProfilePhotoUrls: [],
  platformTheme: null,
  hydrate: async () => {
    try {
      const ref = defaultPublicThemeRef();
      const qs = new URLSearchParams({ app: "vendor_mobile", ref });
      const res = await fetch(`${API_BASE_URL}/api/public/theme?${qs}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.currencyCode) {
          set({ code: data.currencyCode.toUpperCase() });
        }
        if (data?.languageConfig) {
          set({
            languageConfig: {
              defaultLanguage: String(data.languageConfig.defaultLanguage || "en"),
              locked: Boolean(data.languageConfig.locked),
            },
          });
        }
        const urls = data?.defaultProfilePhotoUrls;
        const defaultProfilePhotoUrls = Array.isArray(urls)
          ? urls.filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
          : [];
        const light = data?.light && typeof data.light === "object" ? data.light : undefined;
        const dark = data?.dark && typeof data.dark === "object" ? data.dark : undefined;
        const platformTheme: PlatformThemePayload | null =
          (light && Object.keys(light).length > 0) || (dark && Object.keys(dark).length > 0)
            ? { light, dark }
            : null;
        set({ defaultProfilePhotoUrls, platformTheme });
      }
    } catch {}
  },
}));

export function formatPrice(cents: number, currency?: string): string {
  const code = currency || useCurrencyStore.getState().code;
  const localeTag = Localization.getLocales()[0]?.languageTag ?? "en";
  try {
    return new Intl.NumberFormat(localeTag, {
      style: "currency",
      currency: code,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${code}`;
  }
}

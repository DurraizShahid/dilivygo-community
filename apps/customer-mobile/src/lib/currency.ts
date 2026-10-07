import { create } from "zustand";
import * as Localization from "expo-localization";
import { api, API_BASE_URL } from "./api";
import type {
  MapSettings,
  DeliveryFeeConfig,
  DietaryTagPreset,
  BrowseCategoryPreset,
  PlatformThemePayload,
} from "@dilivygo/types";

export interface PlatformLanguageConfig {
  defaultLanguage: string;
  locked: boolean;
}

export interface PlatformBrandingState {
  appName: string;
  logoUrl: string | null;
  wordmarkUrl: string | null;
  helpUrl: string | null;
  supportEmail: string | null;
}

interface CurrencyState {
  code: string;
  mapSettings: MapSettings | null;
  deliveryFeeConfig: DeliveryFeeConfig | null;
  languageConfig: PlatformLanguageConfig | null;
  platformBranding: PlatformBrandingState;
  customerProfilePhotoEnabled: boolean;
  multiShopCartEnabled: boolean;
  customerCutleryEnabled: boolean;
  customerRefundRequestsEnabled: boolean;
  customerWalletEnabled: boolean;
  defaultProfilePhotoUrls: string[];
  dietaryTagPresets: DietaryTagPreset[];
  browseCategoryPresets: BrowseCategoryPreset[];
  /** Platform shadcn token maps from `GET /api/public/theme` (merged into native theme). */
  platformTheme: PlatformThemePayload | null;
  /**
   * When true, the deployment has global `platform_settings.demo_mode = 'true'`.
   * Enables the "Skip OTP (Demo mode only)" toggle on the login screen.
   */
  demoMode: boolean;
  hydrate: (projectRef?: string) => Promise<void>;
}

const DEFAULT_BRANDING: PlatformBrandingState = {
  appName: "Dilivygo",
  logoUrl: null,
  wordmarkUrl: null,
  helpUrl: null,
  supportEmail: null,
};

export const useCurrencyStore = create<CurrencyState>((set) => ({
  code: "GBP",
  mapSettings: null,
  deliveryFeeConfig: null,
  languageConfig: null,
  platformBranding: DEFAULT_BRANDING,
  customerProfilePhotoEnabled: true,
  multiShopCartEnabled: false,
  customerCutleryEnabled: true,
  customerRefundRequestsEnabled: true,
  customerWalletEnabled: false,
  defaultProfilePhotoUrls: [],
  dietaryTagPresets: [],
  browseCategoryPresets: [],
  platformTheme: null,
  demoMode: false,
  hydrate: async (projectRef) => {
    try {
      const qs = new URLSearchParams({ app: "customer_mobile" });
      if (projectRef) qs.set("ref", projectRef);
      const res = await fetch(`${API_BASE_URL}/api/public/theme?${qs}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.currencyCode) {
          set({ code: data.currencyCode.toUpperCase() });
        }
        if (data?.mapSettings) {
          set({ mapSettings: data.mapSettings });
        }
        if (data?.deliveryFeeConfig) {
          set({ deliveryFeeConfig: data.deliveryFeeConfig });
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
        const dietaryTagPresets = Array.isArray(data?.dietaryTagPresets)
          ? (data.dietaryTagPresets as DietaryTagPreset[])
          : [];
        const browseCategoryPresets = Array.isArray(data?.browseCategoryPresets)
          ? (data.browseCategoryPresets as BrowseCategoryPreset[])
          : [];
        const light = data?.light && typeof data.light === "object" ? data.light : undefined;
        const dark = data?.dark && typeof data.dark === "object" ? data.dark : undefined;
        const platformTheme: PlatformThemePayload | null =
          (light && Object.keys(light).length > 0) || (dark && Object.keys(dark).length > 0)
            ? { light, dark }
            : null;
        set({
          platformBranding: {
            appName: String(data?.appName || DEFAULT_BRANDING.appName),
            logoUrl: data?.logoUrl ? String(data.logoUrl) : null,
            wordmarkUrl: data?.wordmarkUrl ? String(data.wordmarkUrl) : null,
            helpUrl: data?.helpUrl ? String(data.helpUrl) : null,
            supportEmail: data?.supportEmail ? String(data.supportEmail) : null,
          },
          customerProfilePhotoEnabled: data?.customerProfilePhotoEnabled !== false,
          multiShopCartEnabled: data?.multiShopCartEnabled === true,
          customerCutleryEnabled: data?.customerCutleryEnabled !== false,
          customerRefundRequestsEnabled: data?.customerRefundRequestsEnabled !== false,
          customerWalletEnabled: data?.customerWalletEnabled === true,
          defaultProfilePhotoUrls,
          dietaryTagPresets,
          browseCategoryPresets,
          platformTheme,
          demoMode: data?.demoMode === true,
        });
      }
    } catch {};
  },
}));

const DEFAULT_FEE_CENTS = 250;

export function computeDeliveryFee(
  config: DeliveryFeeConfig | null | undefined,
  subtotalCents: number,
): number {
  if (!config) return DEFAULT_FEE_CENTS;

  if (
    config.freeDeliveryThresholdCents > 0 &&
    subtotalCents >= config.freeDeliveryThresholdCents
  ) {
    return 0;
  }

  if (config.type === "tiered" && config.tiers?.length) {
    for (const tier of config.tiers) {
      if (tier.upToCents == null || subtotalCents <= tier.upToCents) {
        return tier.feeCents;
      }
    }
    const last = config.tiers[config.tiers.length - 1];
    return last.feeCents;
  }

  return config.flatFeeCents ?? DEFAULT_FEE_CENTS;
}

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

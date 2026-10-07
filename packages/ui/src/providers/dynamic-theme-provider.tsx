"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  MapSettings,
  DeliveryFeeConfig,
  LanguageConfig,
  DietaryTagPreset,
  BrowseCategoryPreset,
  ResolvedTheme,
  ThemeColors,
} from "@dilivygo/types";
import { DEFAULT_PLATFORM_FAVICON_URL } from "../lib/default-platform-branding-assets";
import { buildThemeCssBlock, themeColorsToCssVarMapForWebInjection } from "../lib/expand-theme-css-vars";
import { CurrencyContext } from "./currency-context";
import { applyRuntimeThemePolicy } from "@dilivygo/theme-engine";

type ResolvedThemePayload = ResolvedTheme;

/** CSS selectors where light / dark platform token maps are injected (logistics shells need higher-specificity selectors). */
export interface ThemeColorScopes {
  light?: string[];
  dark?: string[];
}

const DEFAULT_LIGHT_SCOPES = [":root"] as const;
const DEFAULT_DARK_SCOPES = [".dark"] as const;
const HOST_REF_RE = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.(customer|rider|vendor|pos)\./i;

function deriveRefFromHostname(hostname: string | null | undefined): string | null {
  const h = typeof hostname === "string" ? hostname.split(":")[0].trim().toLowerCase() : "";
  if (!h) return null;
  const m = HOST_REF_RE.exec(h);
  if (!m) return null;
  const slug = m[1];
  if (!slug || slug === "www" || slug === "_marketplace") return null;
  return slug;
}

function resolveThemeColorScopes(themeColorScopes?: ThemeColorScopes): {
  light: string[];
  dark: string[];
} {
  return {
    light:
      themeColorScopes?.light && themeColorScopes.light.length > 0
        ? themeColorScopes.light
        : [...DEFAULT_LIGHT_SCOPES],
    dark:
      themeColorScopes?.dark && themeColorScopes.dark.length > 0
        ? themeColorScopes.dark
        : [...DEFAULT_DARK_SCOPES],
  };
}

/** Presets for dashboard apps whose logistics shell overrides plain `:root` / `.dark`. */
export const VENDOR_LOGISTICS_THEME_SCOPES: ThemeColorScopes = {
  light: [":root", 'html.light [data-vendor-shell="logistics"]'],
  dark: [".dark", 'html.dark [data-vendor-shell="logistics"]'],
};

export const SUPERADMIN_LOGISTICS_THEME_SCOPES: ThemeColorScopes = {
  light: [":root", 'html.light [data-superadmin-shell="logistics"]'],
  dark: [".dark", 'html.dark [data-superadmin-shell="logistics"]'],
};

export const POS_LOGISTICS_THEME_SCOPES: ThemeColorScopes = {
  light: [":root"],
  dark: [".dark", 'html[data-pos-shell="logistics"].dark'],
};

export interface PlatformBranding {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  wordmarkUrl: string | null;
  ogImageUrl: string | null;
  supportEmail: string | null;
  helpUrl: string | null;
  currencyCode: string;
}

const DEFAULT_CURRENCY = "GBP";

function emptyBranding(fallbackAppName: string): PlatformBranding {
  return {
    appName: fallbackAppName,
    logoUrl: null,
    faviconUrl: null,
    wordmarkUrl: null,
    ogImageUrl: null,
    supportEmail: null,
    helpUrl: null,
    currencyCode: DEFAULT_CURRENCY,
  };
}

function payloadToBranding(
  t: Partial<ResolvedThemePayload>,
  fallbackAppName: string,
): PlatformBranding {
  const s = (v: unknown) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);
  return {
    appName: s(t.appName) || fallbackAppName,
    logoUrl: s(t.logoUrl),
    faviconUrl: s(t.faviconUrl),
    wordmarkUrl: s(t.wordmarkUrl),
    ogImageUrl: s(t.ogImageUrl),
    supportEmail: s(t.supportEmail),
    helpUrl: s(t.helpUrl),
    currencyCode: (s(t.currencyCode) || DEFAULT_CURRENCY).toUpperCase(),
  };
}

const BrandingContext = createContext<PlatformBranding | null>(null);
const MapSettingsContext = createContext<MapSettings | undefined>(undefined);
const DeliveryFeeConfigContext = createContext<DeliveryFeeConfig | undefined>(undefined);
const LanguageConfigContext = createContext<LanguageConfig | undefined>(undefined);
const DietaryTagPresetsContext = createContext<DietaryTagPreset[] | undefined>(undefined);
const BrowseCategoryPresetsContext = createContext<BrowseCategoryPreset[] | undefined>(undefined);
const CustomerProfilePhotoContext = createContext<boolean>(true);
const MultiShopCartContext = createContext<boolean>(false);
const CustomerCutleryContext = createContext<boolean>(true);
const CustomerRefundRequestsContext = createContext<boolean>(true);
const CustomerWalletContext = createContext<boolean>(false);
const DefaultProfilePhotoUrlsContext = createContext<string[]>([]);
const DemoModeContext = createContext<boolean>(false);

export function usePlatformBranding(): PlatformBranding {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    throw new Error("usePlatformBranding must be used within DynamicThemeProvider");
  }
  return ctx;
}

export function useMapSettings(): MapSettings | undefined {
  return useContext(MapSettingsContext);
}

export function useDeliveryFeeConfig(): DeliveryFeeConfig | undefined {
  return useContext(DeliveryFeeConfigContext);
}

export function useLanguageConfigFromTheme(): LanguageConfig | undefined {
  return useContext(LanguageConfigContext);
}

/** Full merged list from `/api/public/theme` (core four + superadmin additions). */
export function useDietaryTagPresetsFromTheme(): DietaryTagPreset[] | undefined {
  return useContext(DietaryTagPresetsContext);
}

/** Platform browse categories for customer home (from `/api/public/theme`). */
export function useBrowseCategoryPresetsFromTheme(): BrowseCategoryPreset[] | undefined {
  return useContext(BrowseCategoryPresetsContext);
}

/** When false, hide customer profile photo upload UI (from `/api/public/theme`). Default true. */
export function useCustomerProfilePhotoEnabled(): boolean {
  return useContext(CustomerProfilePhotoContext);
}

/** When true, allow one cart spanning multiple shops with a single checkout delivery fee. */
export function useMultiShopCartEnabled(): boolean {
  return useContext(MultiShopCartContext);
}

/** When false, hide cutlery request at checkout (from `/api/public/theme`). Default true. */
export function useCustomerCutleryEnabled(): boolean {
  return useContext(CustomerCutleryContext);
}

/** When false, hide customer refund request UI (from `/api/public/theme`). Default true. */
export function useCustomerRefundRequestsEnabled(): boolean {
  return useContext(CustomerRefundRequestsContext);
}

/** When true, show wallet balance, top-up, and checkout wallet apply (from `/api/public/theme`). Default false. */
export function useCustomerWalletEnabled(): boolean {
  return useContext(CustomerWalletContext);
}

/** Public default avatar URLs from `/api/public/theme` (Supabase Storage). Empty until theme loads. */
export function useDefaultProfilePhotoUrls(): string[] {
  return useContext(DefaultProfilePhotoUrlsContext);
}

/**
 * When true, the deployment has global `platform_settings.demo_mode = 'true'`.
 * Customer apps use this to render a "Skip OTP (Demo mode only)" checkbox on
 * the login screen. Default false — hidden in production until an operator
 * explicitly enables demo mode via superadmin.
 */
export function useDemoMode(): boolean {
  return useContext(DemoModeContext);
}

const DEFAULT_THEME_STORAGE_KEY = "dilivygo-theme-cache";

/**
 * Fixed dark-mode operational surfaces. Single source of truth lives in
 * `@dilivygo/theme-engine` surface-policy (DARK_PAGE_BACKGROUND /
 * DARK_SURFACE_BACKGROUND) so previews (applyRuntimeThemePolicy) and runtime
 * can never drift. Local constants mirror those values for the blocking
 * script which cannot import at parse time — keep in sync.
 */
const DARK_PAGE_BACKGROUND = "#09090B";

/** Fixed dark-mode surfaces: cards, popovers, muted/secondary/accent fills (globals + injection). */
const DARK_SURFACE_BACKGROUND = "#18181B";

const TOKEN_MAP_JSON = JSON.stringify(themeColorsToCssVarMapForWebInjection());

/**
 * Inline script that runs synchronously before React hydrates.
 * Reads the cached theme from localStorage and injects CSS variables
 * immediately to prevent flash of default colors.
 */
function buildBlockingScript(
  storageKey: string,
  lightSelectors: string[],
  darkSelectors: string[],
  fixedDarkShell: boolean,
): string {
  const lightSelsLiteral = JSON.stringify(lightSelectors).replace(/</g, "\\u003c");
  const darkSelsLiteral = JSON.stringify(darkSelectors).replace(/</g, "\\u003c");
  return `
(function(){
  try {
    var c = localStorage.getItem("${storageKey}");
    if (!c) return;
    var t = JSON.parse(c);
    var m = ${TOKEN_MAP_JSON};
    var lightSels = ${lightSelsLiteral};
    var darkSels = ${darkSelsLiteral};
    var fixedDarkShell = ${fixedDarkShell ? "true" : "false"};
    var rules = [];
    function sv(v) {
      if (!v || typeof v !== "string") return "";
      v = v.trim();
      if (!v) return "";
      if (/^#[0-9a-f]{3,4}$/i.test(v)) return v;
      if (/^#[0-9a-f]{6}$/i.test(v)) return v;
      if (/^#[0-9a-f]{8}$/i.test(v)) return v;
      if (/^rgb\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
      if (/^rgba\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
      if (/^hsl\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
      if (/^hsla\(\s*[0-9\s.,%]+\s*\)$/i.test(v)) return v;
      if (/^oklch\(\s*[0-9\s./%]+\s*\)$/i.test(v)) return v;
      if (/^oklab\(\s*[0-9\s./%]+\s*\)$/i.test(v)) return v;
      if (/^var\(--[a-z0-9-_]+\)$/i.test(v)) return v;
      if (/^(transparent|currentColor)$/i.test(v)) return v;
      return "";
    }
    function build(colors, sel) {
      if (!colors) return;
      var d = [];
      for (var k in m) {
        var v = sv(colors[k]);
        if (v) d.push(m[k] + ": " + v + ";");
      }
      var p = sv(colors.primary);
      if (p) {
        d.push("--ring: " + p + ";");
        d.push("--sidebar-primary: " + p + ";");
        d.push("--sidebar-ring: " + p + ";");
        d.push("--chart-1: " + p + ";");
      }
      var pf = sv(colors.primaryForeground);
      if (pf) {
        d.push("--sidebar-primary-foreground: " + pf + ";");
      }
      if (d.length) rules.push(sel + " { " + d.join(" ") + " }");
    }
    for (var li = 0; li < lightSels.length; li++) build(t.light, lightSels[li]);
    if (t.dark) {
      var mergedDark = fixedDarkShell ? Object.assign({}, t.dark, {
        background: "${DARK_PAGE_BACKGROUND}",
        secondary: "${DARK_SURFACE_BACKGROUND}",
        muted: "${DARK_SURFACE_BACKGROUND}",
        accent: "${DARK_SURFACE_BACKGROUND}",
      }) : t.dark;
      for (var di = 0; di < darkSels.length; di++) build(mergedDark, darkSels[di]);
    }
    if (rules.length) {
      var s = document.createElement("style");
      s.id = "dilivygo-dynamic-theme";
      s.textContent = rules.join("\\n");
      document.head.appendChild(s);
    }
  } catch(e) {}
})();
`;
}

function buildCSS(colors: ThemeColors, selector: string): string {
  return buildThemeCssBlock(colors, selector);
}

function injectTheme(
  theme: Pick<ResolvedThemePayload, "light" | "dark">,
  lightSelectors: string[],
  darkSelectors: string[],
  appName: string,
) {
  let styleEl = document.getElementById("dilivygo-dynamic-theme") as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "dilivygo-dynamic-theme";
    document.head.appendChild(styleEl);
  }

  const rules: string[] = [];
  const pair = {
    light: (theme.light || {}) as unknown as Record<string, string>,
    dark: (theme.dark || {}) as unknown as Record<string, string>,
  };
  const lightEffective = applyRuntimeThemePolicy(pair, appName, "light") as unknown as ThemeColors;
  const darkEffective = applyRuntimeThemePolicy(pair, appName, "dark") as unknown as ThemeColors;
  for (const sel of lightSelectors) {
    const lightCSS = buildCSS(lightEffective, sel);
    if (lightCSS) rules.push(lightCSS);
  }
  for (const sel of darkSelectors) {
    const darkCSS = buildCSS(darkEffective, sel);
    if (darkCSS) rules.push(darkCSS);
  }

  const nextCss = rules.join("\n");
  if (styleEl.textContent !== nextCss) {
    styleEl.textContent = nextCss;
  }
}

function readCachedBranding(
  fallbackAppName: string,
  storageKey: string,
): PlatformBranding {
  if (typeof window === "undefined") {
    return emptyBranding(fallbackAppName);
  }
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return emptyBranding(fallbackAppName);
    const t = JSON.parse(raw) as Partial<ResolvedThemePayload>;
    return payloadToBranding(t, fallbackAppName);
  } catch {
    return emptyBranding(fallbackAppName);
  }
}

function readCachedDefaultProfilePhotoUrls(storageKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const t = JSON.parse(raw) as Partial<ResolvedThemePayload>;
    const u = t.defaultProfilePhotoUrls;
    if (!Array.isArray(u)) return [];
    return u.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

function readCachedCustomerCutleryEnabled(storageKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return true;
    const t = JSON.parse(raw) as Partial<ResolvedThemePayload>;
    return t.customerCutleryEnabled !== false;
  } catch {
    return true;
  }
}

function readCachedCustomerRefundRequestsEnabled(storageKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return true;
    const t = JSON.parse(raw) as Partial<ResolvedThemePayload>;
    return t.customerRefundRequestsEnabled !== false;
  } catch {
    return true;
  }
}

function readCachedCustomerWalletEnabled(storageKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return false;
    const t = JSON.parse(raw) as Partial<ResolvedThemePayload>;
    return t.customerWalletEnabled === true;
  } catch {
    return false;
  }
}

function setMetaProperty(property: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(
    `meta[property="${property}"]`,
  );
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setMetaName(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertOgTags(branding: PlatformBranding) {
  if (typeof document === "undefined") return;
  const title = branding.appName;
  const og = branding.ogImageUrl;

  setMetaProperty("og:title", title);
  if (og) {
    setMetaProperty("og:image", og);
    setMetaName("twitter:image", og);
    setMetaName("twitter:card", "summary_large_image");
  }
}

export function DynamicThemeProvider({
  apiUrl,
  appName,
  projectRef,
  fallbackAppName,
  titleSuffix,
  /** When false, still loads branding/settings from `/api/public/theme` but does not inject or cache light/dark CSS variables (app uses static globals). */
  applyThemeColors = true,
  /** Where to inject `light` / merged-dark token maps (defaults to `:root` and `.dark`). Use logistics presets for vendor/superadmin/POS. */
  themeColorScopes,
  /** localStorage key for theme payload cache & blocking script (use a dedicated key when applyThemeColors is false). */
  themeStorageKey = DEFAULT_THEME_STORAGE_KEY,
  children,
}: {
  apiUrl: string;
  /** Theme target: customer_web, rider_web, etc. */
  appName: string;
  projectRef?: string;
  /** Label when API has no platform app name yet */
  fallbackAppName: string;
  /** Optional suffix appended to browser tab title (e.g., "Rider", "POS") */
  titleSuffix?: string;
  applyThemeColors?: boolean;
  themeColorScopes?: ThemeColorScopes;
  themeStorageKey?: string;
  children: ReactNode;
}) {
  const resolvedScopes = useMemo(
    () => resolveThemeColorScopes(themeColorScopes),
    [themeColorScopes],
  );
  const themeFetchInFlight = useRef(false);
  const lastThemeFetchAt = useRef(0);
  const [effectiveProjectRef, setEffectiveProjectRef] = useState<string | undefined>(projectRef);
  const [branding, setBranding] = useState<PlatformBranding>(() =>
    emptyBranding(fallbackAppName),
  );
  const [mapSettings, setMapSettings] = useState<MapSettings | undefined>(
    undefined,
  );
  const [deliveryFeeConfig, setDeliveryFeeConfig] = useState<DeliveryFeeConfig | undefined>(
    undefined,
  );
  const [languageConfig, setLanguageConfig] = useState<LanguageConfig | undefined>(
    undefined,
  );
  const [dietaryTagPresets, setDietaryTagPresets] = useState<DietaryTagPreset[] | undefined>(
    undefined,
  );
  const [browseCategoryPresets, setBrowseCategoryPresets] = useState<
    BrowseCategoryPreset[] | undefined
  >(undefined);
  const [customerProfilePhotoEnabled, setCustomerProfilePhotoEnabled] = useState(true);
  const [multiShopCartEnabled, setMultiShopCartEnabled] = useState(false);
  const [customerCutleryEnabled, setCustomerCutleryEnabled] = useState(() =>
    typeof window === "undefined" ? true : readCachedCustomerCutleryEnabled(themeStorageKey),
  );
  const [customerRefundRequestsEnabled, setCustomerRefundRequestsEnabled] = useState(() =>
    typeof window === "undefined" ? true : readCachedCustomerRefundRequestsEnabled(themeStorageKey),
  );
  const [customerWalletEnabled, setCustomerWalletEnabled] = useState(() =>
    typeof window === "undefined" ? false : readCachedCustomerWalletEnabled(themeStorageKey),
  );
  const [defaultProfilePhotoUrls, setDefaultProfilePhotoUrls] = useState<string[]>(() =>
    typeof window === "undefined" ? [] : readCachedDefaultProfilePhotoUrls(themeStorageKey),
  );
  const [demoMode, setDemoMode] = useState<boolean>(false);

  useLayoutEffect(() => {
    setBranding(readCachedBranding(fallbackAppName, themeStorageKey));
    setDefaultProfilePhotoUrls(readCachedDefaultProfilePhotoUrls(themeStorageKey));
    setCustomerCutleryEnabled(readCachedCustomerCutleryEnabled(themeStorageKey));
    setCustomerRefundRequestsEnabled(readCachedCustomerRefundRequestsEnabled(themeStorageKey));
  }, [fallbackAppName, themeStorageKey]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = titleSuffix
      ? `${branding.appName} ${titleSuffix}`
      : branding.appName;
  }, [branding.appName, titleSuffix]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const href =
      branding.faviconUrl || branding.logoUrl || DEFAULT_PLATFORM_FAVICON_URL || undefined;
    if (!href) return;
    // Next.js may emit `shortcut icon` before `icon`; some browsers still prefer the former.
    const selectors = ['link[rel="shortcut icon"]', 'link[rel="icon"]'] as const;
    let any = false;
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((node) => {
        (node as HTMLLinkElement).href = href;
        any = true;
      });
    }
    if (!any) {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = href;
      document.head.appendChild(link);
    }
  }, [branding.faviconUrl, branding.logoUrl]);

  useEffect(() => {
    upsertOgTags(branding);
  }, [branding.appName, branding.ogImageUrl]);

  const applyThemePayload = useCallback(
    (
      theme: ResolvedThemePayload | null,
      opts?: { cache?: boolean; broadcast?: boolean },
    ) => {
      const cache = opts?.cache !== false;
      const broadcast = opts?.broadcast === true;

      if (!theme) {
        if (cache) localStorage.removeItem(themeStorageKey);
        const el = document.getElementById("dilivygo-dynamic-theme");
        if (el) el.textContent = "";
        setBranding(emptyBranding(fallbackAppName));
        setMapSettings(undefined);
        setDeliveryFeeConfig(undefined);
        setLanguageConfig(undefined);
        setDietaryTagPresets(undefined);
        setBrowseCategoryPresets(undefined);
        setCustomerProfilePhotoEnabled(true);
        setMultiShopCartEnabled(false);
        setCustomerCutleryEnabled(true);
        setCustomerRefundRequestsEnabled(true);
        setCustomerWalletEnabled(false);
        setDefaultProfilePhotoUrls([]);
        setDemoMode(false);
        return null;
      }

      const forStorage: ResolvedThemePayload = applyThemeColors
        ? theme
        : { ...theme, light: {}, dark: {} };
      if (applyThemeColors) {
        injectTheme(forStorage, resolvedScopes.light, resolvedScopes.dark, appName);
      }
      if (cache) {
        localStorage.setItem(themeStorageKey, JSON.stringify(forStorage));
      }

      if (broadcast) {
        try {
          const bc = new BroadcastChannel(`dilivygo-theme:${themeStorageKey}`);
          bc.postMessage({ storageKey: themeStorageKey, payload: forStorage });
          bc.close();
        } catch {}
      }

      setBranding(payloadToBranding(theme, fallbackAppName));
      if (theme.mapSettings) setMapSettings(theme.mapSettings);
      if (theme.deliveryFeeConfig) setDeliveryFeeConfig(theme.deliveryFeeConfig);
      if (theme.languageConfig) setLanguageConfig(theme.languageConfig);
      if (theme.dietaryTagPresets?.length) setDietaryTagPresets(theme.dietaryTagPresets);
      else setDietaryTagPresets(undefined);
      if (theme.browseCategoryPresets?.length) setBrowseCategoryPresets(theme.browseCategoryPresets);
      else setBrowseCategoryPresets(undefined);
      setCustomerProfilePhotoEnabled(theme.customerProfilePhotoEnabled !== false);
      setMultiShopCartEnabled(theme.multiShopCartEnabled === true);
      setCustomerCutleryEnabled(theme.customerCutleryEnabled !== false);
      setCustomerRefundRequestsEnabled(theme.customerRefundRequestsEnabled !== false);
      setCustomerWalletEnabled(theme.customerWalletEnabled === true);
      const urls = theme.defaultProfilePhotoUrls;
      setDefaultProfilePhotoUrls(
        Array.isArray(urls)
          ? urls.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          : [],
      );
      setDemoMode(theme.demoMode === true);
      return forStorage;
    },
    [
      applyThemeColors,
      appName,
      fallbackAppName,
      resolvedScopes.dark,
      resolvedScopes.light,
      themeStorageKey,
    ],
  );

  const applyThemeFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(themeStorageKey);
      if (!raw) {
        applyThemePayload(null, { cache: false });
        return;
      }
      const parsed = JSON.parse(raw) as ResolvedThemePayload;
      applyThemePayload(parsed, { cache: false });
    } catch {}
  }, [applyThemePayload, themeStorageKey]);

  const themeEtagKey = `${themeStorageKey}:etag`;

  useEffect(() => {
    setEffectiveProjectRef(projectRef);
  }, [projectRef]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (projectRef && projectRef.trim() && projectRef.trim() !== "_marketplace") return;
    const derived = deriveRefFromHostname(window.location.hostname);
    if (derived) setEffectiveProjectRef(derived);
  }, [projectRef]);

  const loadTheme = useCallback(() => {
    if (typeof window === "undefined") return;
    if (themeFetchInFlight.current) return;
    const minIntervalMs = 30_000;
    if (Date.now() - lastThemeFetchAt.current < minIntervalMs) return;
    themeFetchInFlight.current = true;

    void (async () => {
      try {
        const qs = new URLSearchParams({ app: appName });
        if (effectiveProjectRef) qs.set("ref", effectiveProjectRef);

        let etag: string | null = null;
        try {
          etag = localStorage.getItem(themeEtagKey);
        } catch {}

        const res = await fetch(`${apiUrl}/api/public/theme?${qs}`, {
          credentials: "include",
          headers: etag ? { "If-None-Match": etag } : undefined,
        });

        const nextEtag = res.headers.get("etag");
        if (nextEtag) {
          try {
            localStorage.setItem(themeEtagKey, nextEtag);
          } catch {}
        }

        if (res.status === 304) return;
        if (res.status === 204 || !res.ok) {
          applyThemePayload(null, { cache: true, broadcast: false });
          return;
        }

        const theme = (await res.json()) as ResolvedThemePayload;
        applyThemePayload(theme, { cache: true, broadcast: true });
      } catch {
      } finally {
        themeFetchInFlight.current = false;
        lastThemeFetchAt.current = Date.now();
      }
    })();
  }, [
    apiUrl,
    appName,
    effectiveProjectRef,
    applyThemePayload,
    themeEtagKey,
  ]);

  useEffect(() => {
    loadTheme();
  }, [loadTheme]);

  useEffect(() => {
    const onResume = () => {
      if (document.visibilityState === "visible") loadTheme();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("focus", onResume);
    return () => {
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("focus", onResume);
    };
  }, [loadTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const intervalMs = 30_000;
    let timer: number | null = null;

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      loadTheme();
    };

    timer = window.setInterval(tick, intervalMs);
    tick();

    return () => {
      if (timer != null) window.clearInterval(timer);
    };
  }, [loadTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onThemeUpdated = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { storageKey?: string } | undefined;
      if (!detail?.storageKey || detail.storageKey !== themeStorageKey) return;
      applyThemeFromStorage();
    };
    window.addEventListener("dilivygo-theme-updated", onThemeUpdated as EventListener);

    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== themeStorageKey) return;
      if (!ev.newValue) {
        applyThemePayload(null, { cache: false });
        return;
      }
      try {
        const parsed = JSON.parse(ev.newValue) as ResolvedThemePayload;
        applyThemePayload(parsed, { cache: false });
      } catch {}
    };
    window.addEventListener("storage", onStorage);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(`dilivygo-theme:${themeStorageKey}`);
      bc.onmessage = (msg) => {
        const data = msg?.data as { storageKey?: string; payload?: ResolvedThemePayload } | undefined;
        if (!data?.storageKey || data.storageKey !== themeStorageKey) return;
        if (!data.payload) return;
        try {
          localStorage.setItem(themeStorageKey, JSON.stringify(data.payload));
        } catch {}
        applyThemePayload(data.payload, { cache: false });
      };
    } catch {}

    return () => {
      window.removeEventListener("dilivygo-theme-updated", onThemeUpdated as EventListener);
      window.removeEventListener("storage", onStorage);
      try {
        bc?.close();
      } catch {}
    };
  }, [applyThemeFromStorage, applyThemePayload, themeStorageKey]);

  return (
    <CurrencyContext.Provider value={branding.currencyCode}>
      <BrandingContext.Provider value={branding}>
        <MapSettingsContext.Provider value={mapSettings}>
          <DeliveryFeeConfigContext.Provider value={deliveryFeeConfig}>
            <LanguageConfigContext.Provider value={languageConfig}>
              <DietaryTagPresetsContext.Provider value={dietaryTagPresets}>
                <BrowseCategoryPresetsContext.Provider value={browseCategoryPresets}>
                  <CustomerProfilePhotoContext.Provider value={customerProfilePhotoEnabled}>
                    <MultiShopCartContext.Provider value={multiShopCartEnabled}>
                      <CustomerCutleryContext.Provider value={customerCutleryEnabled}>
                      <CustomerRefundRequestsContext.Provider value={customerRefundRequestsEnabled}>
                        <CustomerWalletContext.Provider value={customerWalletEnabled}>
                        <DefaultProfilePhotoUrlsContext.Provider value={defaultProfilePhotoUrls}>
                        <DemoModeContext.Provider value={demoMode}>
                          <script
                            dangerouslySetInnerHTML={{
                              __html: buildBlockingScript(
                                themeStorageKey,
                                resolvedScopes.light,
                                resolvedScopes.dark,
                                ["vendor_web", "pos_web", "superadmin_web"].includes(appName),
                              ),
                            }}
                          />
                          {children}
                        </DemoModeContext.Provider>
                        </DefaultProfilePhotoUrlsContext.Provider>
                        </CustomerWalletContext.Provider>
                      </CustomerRefundRequestsContext.Provider>
                    </CustomerCutleryContext.Provider>
                    </MultiShopCartContext.Provider>
                  </CustomerProfilePhotoContext.Provider>
                </BrowseCategoryPresetsContext.Provider>
              </DietaryTagPresetsContext.Provider>
            </LanguageConfigContext.Provider>
          </DeliveryFeeConfigContext.Provider>
        </MapSettingsContext.Provider>
      </BrandingContext.Provider>
    </CurrencyContext.Provider>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { i18n } from "i18next";
import { I18nextProvider } from "react-i18next";
import {
  createI18nInstance,
  mergeResourcesIntoInstance,
} from "./config";
import {
  DEFAULT_LANGUAGE,
  getDirection,
  isSupportedLanguage,
  resolveLocale,
} from "./languages";
import { readStoredLanguage, writeStoredLanguage } from "./storage";
import type {
  LanguageConfig,
  SupportedLanguage,
  TranslationResources,
} from "./types";

interface LanguageContextValue {
  language: SupportedLanguage;
  direction: "ltr" | "rtl";
  locked: boolean;
  setLanguage: (lang: SupportedLanguage) => void;
  languageConfig: LanguageConfig;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function detectBrowserLanguage(
  fallback: SupportedLanguage,
): SupportedLanguage {
  if (typeof navigator === "undefined") return fallback;
  const langs = navigator.languages ?? [navigator.language];
  for (const l of langs) {
    const resolved = resolveLocale(l, fallback);
    if (resolved !== fallback || l.toLowerCase().startsWith(fallback)) return resolved;
  }
  return fallback;
}

/**
 * Language for the first paint only (SSR + hydration). Must not read
 * `localStorage` or `navigator` — those differ between server and browser and
 * cause React hydration mismatches on translated text.
 */
function pickLanguageServerSafe(
  cfg: LanguageConfig,
  deviceLocale?: string,
): SupportedLanguage {
  const def = isSupportedLanguage(cfg.defaultLanguage)
    ? cfg.defaultLanguage
    : DEFAULT_LANGUAGE;

  if (cfg.locked) return def;
  if (deviceLocale) return resolveLocale(deviceLocale, def);
  return def;
}

function pickLanguage(
  cfg: LanguageConfig,
  deviceLocale?: string,
): SupportedLanguage {
  const def = isSupportedLanguage(cfg.defaultLanguage)
    ? cfg.defaultLanguage
    : DEFAULT_LANGUAGE;

  if (cfg.locked) return def;

  const stored = readStoredLanguage();
  if (stored) return stored;

  if (deviceLocale) return resolveLocale(deviceLocale, def);

  return detectBrowserLanguage(def);
}

export interface I18nProviderProps {
  children: ReactNode;
  languageConfig?: LanguageConfig;
  resources: TranslationResources;
  defaultNS?: string;
  ns?: string[];
  /** For mobile: pass device locale from expo-localization */
  deviceLocale?: string;
}

export function I18nProvider({
  children,
  languageConfig,
  resources,
  defaultNS,
  ns,
  deviceLocale,
}: I18nProviderProps) {
  const configRef = useRef(languageConfig);
  configRef.current = languageConfig;

  const effectiveConfig: LanguageConfig = useMemo(() => {
    const raw = languageConfig ?? {
      defaultLanguage: DEFAULT_LANGUAGE,
      locked: false,
    };
    return {
      locked: raw.locked,
      defaultLanguage: isSupportedLanguage(raw.defaultLanguage)
        ? raw.defaultLanguage
        : DEFAULT_LANGUAGE,
    };
  }, [languageConfig?.locked, languageConfig?.defaultLanguage]);

  const serverSafeLanguage = useMemo(
    () => pickLanguageServerSafe(effectiveConfig, deviceLocale),
    [
      effectiveConfig.locked,
      effectiveConfig.defaultLanguage,
      deviceLocale,
    ],
  );

  const [language, setLanguageState] =
    useState<SupportedLanguage>(serverSafeLanguage);

  // One instance per provider mount, seeded with server-safe language so SSR and the
  // first client render match (no shared module singleton leaking another language).
  const i18nRef = useRef<i18n | null>(null);
  if (i18nRef.current === null) {
    i18nRef.current = createI18nInstance({
      language: serverSafeLanguage,
      resources,
      defaultNS,
      ns,
    });
  }
  const i18nInstance = i18nRef.current;

  useLayoutEffect(() => {
    mergeResourcesIntoInstance(i18nInstance, resources);
  }, [resources, i18nInstance]);

  // Resolve storage / browser / platform default on mount and when config or
  // device locale changes — not on every `language` state change (user picks
  // are handled in setLanguage with immediate i18next + DOM sync).
  useLayoutEffect(() => {
    const next = pickLanguage(effectiveConfig, deviceLocale);
    setLanguageState((prev) => (prev === next ? prev : next));
    if (i18nInstance.language !== next) {
      void i18nInstance.changeLanguage(next);
    }
    applyDocumentDirection(next);
    writeStoredLanguage(next);
  }, [
    effectiveConfig.locked,
    effectiveConfig.defaultLanguage,
    deviceLocale,
    i18nInstance,
  ]);

  const setLanguage = useCallback(
    (lang: SupportedLanguage) => {
      if (configRef.current?.locked) return;
      writeStoredLanguage(lang);
      void i18nInstance.changeLanguage(lang);
      applyDocumentDirection(lang);
      setLanguageState(lang);
    },
    [i18nInstance],
  );

  const direction = getDirection(language);

  const ctxValue = useMemo<LanguageContextValue>(
    () => ({
      language,
      direction,
      locked: effectiveConfig.locked,
      setLanguage,
      languageConfig: effectiveConfig,
    }),
    [language, direction, effectiveConfig, setLanguage],
  );

  return (
    <LanguageContext.Provider value={ctxValue}>
      <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>
    </LanguageContext.Provider>
  );
}

function applyDocumentDirection(lang: SupportedLanguage) {
  if (typeof document === "undefined") return;
  const dir = getDirection(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within I18nProvider");
  }
  return ctx;
}

export function useDirection(): "ltr" | "rtl" {
  return useLanguage().direction;
}

export function useLanguageConfig(): LanguageConfig {
  return useLanguage().languageConfig;
}

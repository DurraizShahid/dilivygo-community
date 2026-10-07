import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import type { SupportedLanguage, TranslationResources } from "./types";
import { DEFAULT_LANGUAGE } from "./languages";

export interface I18nInitOptions {
  language: SupportedLanguage;
  resources: TranslationResources;
  defaultNS?: string;
  ns?: string[];
}

/** Deep-merge resource bundles so new keys (e.g. after HMR) resolve without a full page reload. */
export function mergeResourcesIntoInstance(
  instance: i18n,
  resources: TranslationResources,
) {
  for (const lng of Object.keys(resources)) {
    const byNs = resources[lng];
    if (!byNs || typeof byNs !== "object") continue;
    for (const namespace of Object.keys(byNs)) {
      const bundle = byNs[namespace];
      if (bundle && typeof bundle === "object") {
        instance.addResourceBundle(lng, namespace, bundle as object, true, true);
      }
    }
  }
}

/**
 * Fresh i18next instance (no module singleton). Each I18nProvider keeps one ref so
 * SSR + first client paint use the same initial `lng` as React state — no leaked
 * language from HMR, another tab, or a prior route.
 */
export function createI18nInstance(options: I18nInitOptions): i18n {
  const { language, resources, defaultNS = "common", ns } = options;

  const namespaces = ns ?? Object.keys(Object.values(resources)[0] ?? {});

  const instance = i18next.createInstance();

  instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    ns: namespaces,
    defaultNS,
    resources,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

  return instance;
}

/**
 * @deprecated Prefer `createI18nInstance`; this no longer uses a singleton (each call returns a new instance).
 */
export function initI18n(options: I18nInitOptions): i18n {
  return createI18nInstance(options);
}

/** @deprecated No global instance; returns null. */
export function getI18nInstance(): i18n | null {
  return null;
}

/**
 * @deprecated Use the `i18n` instance from your `I18nProvider` / `changeLanguage` on that instance.
 */
export function changeLanguage(_lang: SupportedLanguage): void {
  // Intentionally empty — per-provider instances are updated in I18nProvider.
}

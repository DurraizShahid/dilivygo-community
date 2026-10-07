// Core config
export {
  createI18nInstance,
  mergeResourcesIntoInstance,
  initI18n,
  getI18nInstance,
  changeLanguage,
} from "./config";

// React provider + hooks
export {
  I18nProvider,
  useLanguage,
  useDirection,
  useLanguageConfig,
  type I18nProviderProps,
} from "./provider";

// Language metadata
export {
  SUPPORTED_LANGUAGES,
  LANGUAGE_LIST,
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  getDirection,
  resolveLocale,
} from "./languages";

// Types
export type {
  SupportedLanguage,
  LanguageConfig,
  LanguageInfo,
  TranslationResources,
} from "./types";

// Web-only language UI lives in `@dilivygo/i18n/language-switcher` (Radix / react-dom — not for React Native).

// Geo → language hint (customer location)
export { languageHintFromCountryCode } from "./geo-language";

// Explicit user choice (web localStorage)
export {
  markLanguageUserPicked,
  isLanguageUserPicked,
  LANG_USER_PICKED_KEY,
  LANG_STORAGE_KEY,
} from "./storage";

// useTranslation binds `t` to React language state (hydration-safe with I18nProvider)
export { useTranslation } from "./use-translation";

// Common translation bundles
export { default as commonEn } from "./locales/en/common.json";
export { default as commonFr } from "./locales/fr/common.json";
export { default as commonAr } from "./locales/ar/common.json";
export { default as commonEs } from "./locales/es/common.json";
export { default as commonDe } from "./locales/de/common.json";
export { default as commonTr } from "./locales/tr/common.json";
export { default as commonPt } from "./locales/pt/common.json";
export { default as commonUr } from "./locales/ur/common.json";
export { default as commonHi } from "./locales/hi/common.json";
export { default as commonFa } from "./locales/fa/common.json";
export { default as commonZh } from "./locales/zh/common.json";
export { default as commonKo } from "./locales/ko/common.json";
export { default as commonJa } from "./locales/ja/common.json";
export { default as commonRu } from "./locales/ru/common.json";
export { default as commonIt } from "./locales/it/common.json";
export { default as commonEt } from "./locales/et/common.json";
export { default as commonSw } from "./locales/sw/common.json";

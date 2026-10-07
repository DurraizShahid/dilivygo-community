import type { SupportedLanguage, LanguageInfo } from "./types";

export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, LanguageInfo> = {
  en: {
    code: "en",
    name: "English",
    nativeName: "English",
    dir: "ltr",
    flag: "GB",
  },
  fr: {
    code: "fr",
    name: "French",
    nativeName: "Français",
    dir: "ltr",
    flag: "FR",
  },
  ar: {
    code: "ar",
    name: "Arabic",
    nativeName: "العربية",
    dir: "rtl",
    flag: "SA",
  },
  es: {
    code: "es",
    name: "Spanish",
    nativeName: "Español",
    dir: "ltr",
    flag: "ES",
  },
  de: {
    code: "de",
    name: "German",
    nativeName: "Deutsch",
    dir: "ltr",
    flag: "DE",
  },
  tr: {
    code: "tr",
    name: "Turkish",
    nativeName: "Türkçe",
    dir: "ltr",
    flag: "TR",
  },
  pt: {
    code: "pt",
    name: "Portuguese",
    nativeName: "Português",
    dir: "ltr",
    flag: "PT",
  },
  ur: {
    code: "ur",
    name: "Urdu",
    nativeName: "اردو",
    dir: "rtl",
    flag: "PK",
  },
  hi: {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    dir: "ltr",
    flag: "IN",
  },
  fa: {
    code: "fa",
    name: "Persian",
    nativeName: "فارسی",
    dir: "rtl",
    flag: "IR",
  },
  zh: {
    code: "zh",
    name: "Chinese",
    nativeName: "中文",
    dir: "ltr",
    flag: "CN",
  },
  ko: {
    code: "ko",
    name: "Korean",
    nativeName: "한국어",
    dir: "ltr",
    flag: "KR",
  },
  ja: {
    code: "ja",
    name: "Japanese",
    nativeName: "日本語",
    dir: "ltr",
    flag: "JP",
  },
  ru: {
    code: "ru",
    name: "Russian",
    nativeName: "Русский",
    dir: "ltr",
    flag: "RU",
  },
  it: {
    code: "it",
    name: "Italian",
    nativeName: "Italiano",
    dir: "ltr",
    flag: "IT",
  },
  et: {
    code: "et",
    name: "Estonian",
    nativeName: "Eesti",
    dir: "ltr",
    flag: "EE",
  },
  sw: {
    code: "sw",
    name: "Swahili",
    nativeName: "Kiswahili",
    dir: "ltr",
    flag: "KE",
  },
};

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

export const LANGUAGE_LIST: LanguageInfo[] = Object.values(SUPPORTED_LANGUAGES);

export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return code in SUPPORTED_LANGUAGES;
}

export function getDirection(lang: SupportedLanguage): "ltr" | "rtl" {
  return SUPPORTED_LANGUAGES[lang]?.dir ?? "ltr";
}

/**
 * Map a browser/device locale string (e.g. "fr-FR", "ar-EG") to
 * the closest supported language, or return the fallback.
 */
export function resolveLocale(
  locale: string,
  fallback: SupportedLanguage = DEFAULT_LANGUAGE,
): SupportedLanguage {
  const base = locale.split("-")[0]?.toLowerCase();
  if (base && isSupportedLanguage(base)) return base;
  return fallback;
}
